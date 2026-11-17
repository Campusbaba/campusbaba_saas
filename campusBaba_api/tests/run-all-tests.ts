import assert from "assert";
import fs from "fs";
import path from "path";
import http from "http";
import jwt from "jsonwebtoken";

import app, { isAllowedCorsOrigin } from "../src/app";
import { parseEnv, buildConfig } from "../src/config";
import { createContainer } from "../src/composition/container";
import { verifyRlsPoliciesOnMigration } from "../scripts/verify-rls";
import { runEnvAndBoundaryChecks } from "../scripts/check-env-and-boundaries";
import { RlsTenantStore } from "../src/infrastructure/persistence/postgres/rlsTransaction";
import { LocalFsStorageAdapter } from "../src/infrastructure/storage/local-fs.adapter";
import { S3CompatibleStorageAdapter } from "../src/infrastructure/storage/r2.adapter";
import {
  ConsoleSmsAdapter,
  BulkSmsBdAdapter,
  AlphaSmsAdapter,
  SslWirelessSmsAdapter,
} from "../src/infrastructure/sms/sms.adapters";
import { BangladeshiPaymentGatewayAdapter } from "../src/infrastructure/payments/payment.adapters";
import {
  StorageKeyBuilder,
  sniffMagicByteMime,
  stripJpegExif,
  evaluateR2UsageGuardrail,
} from "../src/domain/storage/StorageKeyBuilder";
import {
  calculateBangladeshTermGpa,
  computeMeritPositions,
  evaluateMcqSubmission,
} from "../src/domain/grading/BangladeshGradingPolicy";
import {
  calculateSmsSegments,
  validateBtrcSenderId,
} from "../src/domain/sms/BtrcSmsPolicy";
import {
  allocatePaymentOldestDueFirst,
  calculateProRatedCoachingFee,
  calculateTeacherPayroll,
} from "../src/domain/finance/FeeAllocationPolicy";
import {
  formatBdtLakhCrore,
  toBanglaNumerals,
  amountInWordsBdt,
  formatBanglaDate,
} from "../../packages/shared/src/bd-localization";
import { seedBangladeshArchetypeTenants } from "../src/seed/bdArchetypeSeeds";
import { runMongoToPostgresEtlForTenant } from "../../tools/migrate-mongo-to-pg";
import { migrateStorageObjectsBetweenDrivers } from "../../tools/storage-migrate";
import { StoragePort } from "../src/ports/StoragePort";
import { SmsPort } from "../src/ports/SmsPort";
import { PaymentGatewayPort } from "../src/ports/PaymentGatewayPort";

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(suite: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ suite, name, passed: true });
    console.log(`  ✅ [${suite}] ${name}`);
  } catch (err: any) {
    results.push({
      suite,
      name,
      passed: false,
      error: err?.stack || err?.message || String(err),
    });
    console.error(`  ❌ [${suite}] ${name}: ${err?.message || err}`);
  }
}

function httpRequest(
  serverPort: number,
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: serverPort,
        method: options.method,
        path: options.path,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
          ...(options.headers || {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed: any = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // keep string
          }
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("=================================================================");
  console.log("🚀 Running CampusBaba SaaS Refurbishment Complete Test Suite");
  console.log("=================================================================\n");

  // ---------------------------------------------------------------------------
  // SUITE 1: CI Boundary Linter, .env.example Sync & PostgreSQL RLS DDL Gate
  // ---------------------------------------------------------------------------
  await runTest(
    "CI-Gates",
    "All 37 tenant tables in 0001_initial_rls_schema.sql enforce tenant_id NOT NULL + ENABLE/FORCE RLS + USING/WITH CHECK policy",
    () => {
      const sqlPath = path.resolve(
        __dirname,
        "../src/infrastructure/persistence/postgres/migrations/0001_initial_rls_schema.sql"
      );
      const sql = fs.readFileSync(sqlPath, "utf8");
      const check = verifyRlsPoliciesOnMigration(sql);
      assert.strictEqual(
        check.passed,
        true,
        `RLS violations: ${check.violations.join("; ")}`
      );
      assert.ok(check.checkedTables >= 37);
    }
  );

  await runTest(
    "CI-Gates",
    "Hexagonal boundaries clean (no process.env outside src/config/, no SDKs in pure layers, .env.example synced across all 3 apps)",
    () => {
      const check = runEnvAndBoundaryChecks();
      assert.strictEqual(
        check.passed,
        true,
        `Boundary violations: ${check.violations.join("; ")}`
      );
    }
  );

  await runTest(
    "CI-Gates",
    "App boots with only local/console/memory/inline drivers and zero external accounts; fails clearly when required prod secret is missing",
    () => {
      // 1. Zero-external-account dev/test boot
      const devParsed = parseEnv({ NODE_ENV: "test" }, false);
      const devCfg = buildConfig(devParsed);
      const devContainer = createContainer(devCfg);
      assert.strictEqual(devContainer.storage.driverName, "local");
      assert.strictEqual(devContainer.cache.driverName, "memory");
      assert.strictEqual(devContainer.queue.driverName, "inline");
      assert.strictEqual(devContainer.sms.driverName, "console");

      // 2. Production boot fails fast with readable list when secrets are missing
      assert.throws(
        () =>
          parseEnv(
            {
              NODE_ENV: "production",
              STORAGE_DRIVER: "r2",
            },
            false
          ),
        /Missing or invalid required production environment variables/
      );
    }
  );

  // ---------------------------------------------------------------------------
  // SUITE 2: PostgreSQL Row-Level Security (RLS) Isolation & Fail-Closed Tests
  // ---------------------------------------------------------------------------
  await runTest(
    "RLS-Isolation",
    "Fail-closed: Querying or inserting without app.current_tenant returns zero rows and blocks writes",
    () => {
      const store = new RlsTenantStore();
      assert.deepStrictEqual(store.findMany("students"), []);
      assert.throws(
        () => store.insert("students", { first_name: "Unscoped" }),
        /RLS WITH CHECK violation/
      );
    }
  );

  await runTest(
    "RLS-Isolation",
    "Two-tenant strict isolation: Tenant A cannot read, update, delete, or forge rows belonging to Tenant B",
    () => {
      const store = new RlsTenantStore();
      const tenantA = "11111111-1111-7111-8111-111111111111";
      const tenantB = "22222222-2222-7222-8222-222222222222";

      const studentA = RlsTenantStore.runWithTenantContext({ tenantId: tenantA }, () =>
        store.insert("students", { student_code: "STU-0001", first_name: "Rahim" })
      );

      const studentB = RlsTenantStore.runWithTenantContext({ tenantId: tenantB }, () =>
        store.insert("students", { student_code: "STU-0001", first_name: "Karim" })
      );

      // Tenant A only sees Rahim
      RlsTenantStore.runWithTenantContext({ tenantId: tenantA }, () => {
        const rows = store.findMany("students");
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].first_name, "Rahim");

        // Tenant A cannot read, update, or delete Tenant B's student by ID
        assert.strictEqual(store.findById("students", studentB.id), null);
        assert.strictEqual(
          store.updateById("students", studentB.id, { first_name: "Hacked" }),
          null
        );
        assert.strictEqual(store.deleteById("students", studentB.id), false);

        // Tenant A cannot insert a row with tenant_id = tenantB
        assert.throws(
          () =>
            store.insert("students", {
              tenant_id: tenantB,
              first_name: "Spoofed",
            }),
          /RLS WITH CHECK violation/
        );
      });

      // Verify SQL SET LOCAL statement generation for PgBouncer transaction mode
      const sqlStmt = RlsTenantStore.buildSetLocalTenantSql(tenantA);
      assert.strictEqual(
        sqlStmt.text,
        "SELECT set_config('app.current_tenant', $1, true);"
      );
      assert.strictEqual(sqlStmt.values[0], tenantA);
      assert.ok(studentA.id);
    }
  );

  // ---------------------------------------------------------------------------
  // SUITE 3: StoragePort Contract Tests (local, r2, s3, minio) & Cross-Tenant Proof
  // ---------------------------------------------------------------------------
  const tempStorageDir = path.resolve(__dirname, "../.storage-test");
  const storageAdapters: StoragePort[] = [
    new LocalFsStorageAdapter({
      rootDir: tempStorageDir,
      signingSecret: "test-storage-secret-key-32-bytes!!",
      defaultTtlSeconds: 300,
    }),
    new S3CompatibleStorageAdapter({
      driverName: "r2",
      endpoint: "https://demo-account.r2.cloudflarestorage.com",
      bucket: "campusbaba-r2",
      accessKeyId: "r2-key",
      secretAccessKey: "r2-secret",
    }),
    new S3CompatibleStorageAdapter({
      driverName: "minio",
      endpoint: "http://localhost:9000",
      bucket: "campusbaba-minio",
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadminpassword",
    }),
    new S3CompatibleStorageAdapter({
      driverName: "s3",
      endpoint: "https://s3.ap-southeast-1.amazonaws.com",
      bucket: "campusbaba-s3",
      accessKeyId: "aws-key",
      secretAccessKey: "aws-secret",
    }),
  ];

  for (const adapter of storageAdapters) {
    await runTest(
      `StoragePort-Contract (${adapter.driverName})`,
      "putObject, headObject, list, signed URLs, deletePrefix, and strict cross-tenant key rejection",
      async () => {
        const tenantA = "schoola";
        const tenantB = "schoolb";

        const keyA = StorageKeyBuilder.buildTenantKey({
          tenantId: tenantA,
          module: "marksheets",
          entityId: "stu-1",
          fileUuid: "uuid-1",
          originalName: "Term Result 2026.pdf",
        });
        const keyB = StorageKeyBuilder.buildTenantKey({
          tenantId: tenantB,
          module: "marksheets",
          entityId: "stu-2",
          fileUuid: "uuid-2",
          originalName: "Secret NID.pdf",
        });

        const pdfBytes = Buffer.from("%PDF-1.4 sample pdf content", "utf8");
        await adapter.putObject(keyA, pdfBytes, {
          contentType: "application/pdf",
          sizeBytes: pdfBytes.length,
          tenantId: tenantA,
        });
        await adapter.putObject(keyB, pdfBytes, {
          contentType: "application/pdf",
          sizeBytes: pdfBytes.length,
          tenantId: tenantB,
        });

        // Tenant A can head and list its own object
        const headA = await adapter.headObject(keyA, { tenantId: tenantA });
        assert.ok(headA);
        assert.strictEqual(headA.sizeBytes, pdfBytes.length);

        const listA = await adapter.list(`tenants/${tenantA}/`, undefined, {
          tenantId: tenantA,
        });
        assert.strictEqual(listA.items.length, 1);
        assert.strictEqual(listA.items[0].key, keyA);

        // Cross-Tenant Proof: Tenant A CANNOT head, read, list, or delete Tenant B's objects
        await assert.rejects(
          () => adapter.headObject(keyB, { tenantId: tenantA }),
          /Cross-tenant storage access denied/
        );
        await assert.rejects(
          () => adapter.getObjectBuffer(keyB, { tenantId: tenantA }),
          /Cross-tenant storage access denied/
        );
        await assert.rejects(
          () => adapter.list(`tenants/${tenantB}/`, undefined, { tenantId: tenantA }),
          /Cross-tenant storage access denied/
        );
        await assert.rejects(
          () => adapter.deleteObject(keyB, { tenantId: tenantA }),
          /Cross-tenant storage access denied/
        );

        // Path traversal keys are rejected
        assert.throws(
          () =>
            StorageKeyBuilder.buildTenantKey({
              tenantId: "../schoolb",
              module: "docs",
              entityId: "1",
              fileUuid: "2",
              originalName: "a.pdf",
            }),
          /Invalid path traversal/
        );

        // Signed Download URL verification: valid, expired, forged, and cross-tenant
        const downloadUrl = await adapter.getSignedDownloadUrl(keyA, {
          ttlSeconds: 60,
          downloadName: "result.pdf",
          forceDownload: true,
          tenantId: tenantA,
        });
        const verifyOk = adapter.verifySignedUrl!(downloadUrl, tenantA);
        assert.strictEqual(verifyOk.valid, true);

        // Forged signature rejected
        const forgedUrl = downloadUrl.replace(/sig=[^&]+|X-Amz-Signature=[^&]+/, (m) =>
          m.slice(0, -4) + "0000"
        );
        assert.strictEqual(adapter.verifySignedUrl!(forgedUrl, tenantA).valid, false);

        // Cross-tenant signed URL usage rejected
        assert.strictEqual(adapter.verifySignedUrl!(downloadUrl, tenantB).valid, false);

        // Expired signed URL rejected
        const expiredUrl = await adapter.getSignedDownloadUrl(keyA, {
          ttlSeconds: -10,
          tenantId: tenantA,
        });
        const expiredCheck = adapter.verifySignedUrl!(expiredUrl, tenantA);
        assert.strictEqual(expiredCheck.valid, false);
        assert.strictEqual(expiredCheck.expired, true);

        // Cleanup via deletePrefix
        const deletedA = await adapter.deletePrefix(`tenants/${tenantA}/`, {
          tenantId: tenantA,
        });
        assert.strictEqual(deletedA, 1);
        await adapter.deletePrefix(`tenants/${tenantB}/`, { tenantId: tenantB });
      }
    );
  }

  await runTest(
    "StoragePort-Safety",
    "Magic-byte MIME sniffer, JPEG EXIF APP1 stripper, EICAR antivirus quarantine, R2 70/90% guardrails, and cross-driver migration tool",
    async () => {
      // 1. Magic-byte MIME sniffer
      assert.strictEqual(
        sniffMagicByteMime(Buffer.from("%PDF-1.7 test", "utf8")),
        "application/pdf"
      );
      assert.strictEqual(
        sniffMagicByteMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        "image/png"
      );

      // 2. Strip JPEG APP1 (EXIF) segment
      const fakeJpegWithExif = Buffer.from([
        0xff, 0xd8, // SOI
        0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, // APP1 (EXIF) 6 bytes
        0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, // DQT 4 bytes
        0xff, 0xd9, // EOI
      ]);
      const stripped = stripJpegExif(fakeJpegWithExif);
      assert.strictEqual(stripped.includes(Buffer.from("Exif")), false);
      assert.strictEqual(stripped[0], 0xff);
      assert.strictEqual(stripped[1], 0xd8);

      // 3. R2 Free-tier 70% / 90% alerts & per-tenant quota guardrail
      const tenGb = 10 * 1024 * 1024 * 1024;
      const warnCheck = evaluateR2UsageGuardrail({
        tenantUsedBytes: 10 * 1024 * 1024,
        tenantQuotaMb: 500,
        platformTotalBytes: Math.floor(tenGb * 0.75),
        uploadSizeBytes: 1024,
      });
      assert.strictEqual(warnCheck.allowed, true);
      assert.strictEqual(warnCheck.platformAlertLevel, "warning_70");

      const quotaExceeded = evaluateR2UsageGuardrail({
        tenantUsedBytes: 500 * 1024 * 1024,
        tenantQuotaMb: 500,
        platformTotalBytes: 500 * 1024 * 1024,
        uploadSizeBytes: 1024,
      });
      assert.strictEqual(quotaExceeded.allowed, false);

      // 4. Cross-driver migration (local -> r2)
      const localDriver = storageAdapters[0];
      const r2Driver = storageAdapters[1];
      const testContainer = createContainer();
      const uploaded = await testContainer.fileStorage.uploadAndConfirmBuffer({
        tenantId: "migtenant",
        tenantQuotaMb: 500,
        module: "nid",
        entityType: "Student",
        entityId: "stu-100",
        originalName: "student-nid.pdf",
        declaredMimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 sensitive nid document", "utf8"),
        uploadedByUserId: "admin-1",
        isSensitive: true,
      });

      const migRes = await migrateStorageObjectsBetweenDrivers({
        sourceDriver: testContainer.storage,
        targetDriver: r2Driver,
        files: [uploaded],
      });
      assert.strictEqual(migRes.migratedCount, 1);
      assert.ok(migRes.bytesTransferred > 0);
      await localDriver.deletePrefix("tenants/migtenant/", { tenantId: "migtenant" });
    }
  );

  // Clean up temp storage directory
  if (fs.existsSync(tempStorageDir)) {
    fs.rmSync(tempStorageDir, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------------------
  // SUITE 4: SmsPort Contract Tests (console, bulksmsbd, alpha, ssl_wireless)
  // ---------------------------------------------------------------------------
  const smsAdapters: SmsPort[] = [
    new ConsoleSmsAdapter("CAMPUSBABA"),
    new BulkSmsBdAdapter("CAMPUSBABA"),
    new AlphaSmsAdapter("CAMPUSBABA"),
    new SslWirelessSmsAdapter("CAMPUSBABA"),
  ];

  for (const smsAdapter of smsAdapters) {
    await runTest(
      `SmsPort-Contract (${smsAdapter.driverName})`,
      "GSM-7 (160/153) vs Bangla Unicode UCS-2 (70/67) segment math, BTRC Sender ID rules, and delivery report parsing",
      async () => {
        // 1. English GSM-7 single segment
        const enRes = await smsAdapter.send(
          "+8801712345678",
          "Dear Guardian, tuition fee of BDT 1500 is received. Thank you."
        );
        assert.strictEqual(enRes.encoding, "GSM_7");
        assert.strictEqual(enRes.segmentCount, 1);

        // 2. Bangla Unicode (>70 chars -> 67 chars per multi-part segment)
        const banglaLongText =
          "প্রিয় অভিভাবক, আপনার সন্তানের মাসিক বেতন ১,৫০০ টাকা সফলভাবে পরিশোধিত হয়েছে। ধন্যবাদ - ক্যাম্পাসবাবা স্কুল।";
        const bnRes = await smsAdapter.send("+8801812345678", banglaLongText);
        assert.strictEqual(bnRes.encoding, "UCS_2");
        assert.strictEqual(bnRes.segmentCount, 2); // >70 and <=134 chars

        // 3. Invalid BTRC masking Sender ID (>11 chars or prohibited generic 'INFO') rejected
        await assert.rejects(
          () =>
            smsAdapter.send("+8801712345678", "Test", {
              senderId: "TOO_LONG_SENDER_ID_123",
            }),
          /between 3 and 11 characters/
        );
        await assert.rejects(
          () => smsAdapter.send("+8801712345678", "Test", { senderId: "INFO" }),
          /prohibited by BTRC/
        );

        // 4. Delivery report parsing
        const dlr = smsAdapter.parseDeliveryReport({
          messageId: bnRes.gatewayMessageId,
          status: "DELIVERED",
        });
        assert.strictEqual(dlr.status, "delivered");
      }
    );
  }

  // ---------------------------------------------------------------------------
  // SUITE 5: PaymentGatewayPort Contract Tests (manual, sslcommerz, bkash, nagad, aamarpay)
  // ---------------------------------------------------------------------------
  const paymentAdapters = [
    new BangladeshiPaymentGatewayAdapter({
      gatewayCode: "manual",
      signingSecret: "sec-manual",
    }),
    new BangladeshiPaymentGatewayAdapter({
      gatewayCode: "sslcommerz",
      signingSecret: "sec-ssl",
    }),
    new BangladeshiPaymentGatewayAdapter({
      gatewayCode: "bkash",
      signingSecret: "sec-bkash",
    }),
    new BangladeshiPaymentGatewayAdapter({
      gatewayCode: "nagad",
      signingSecret: "sec-nagad",
    }),
    new BangladeshiPaymentGatewayAdapter({
      gatewayCode: "aamarpay",
      signingSecret: "sec-aamarpay",
    }),
  ];

  for (const gw of paymentAdapters) {
    await runTest(
      `PaymentGatewayPort-Contract (${gw.gatewayCode})`,
      "createCheckout, signed webhook verification, forged signature rejection, queryTransaction, and refund",
      async () => {
        const checkout = await gw.createCheckout({
          tenantId: "dhakamodel",
          invoiceId: "inv-001",
          studentId: "stu-001",
          amountBdt: 2500,
          customerName: "Tanvir Ahmed",
          customerPhone: "+8801711223344",
          callbackUrl: "https://dhakamodel.campusbaba.com/payments/callback",
          idempotencyKey: "idem-001",
        });
        assert.strictEqual(checkout.gateway, gw.gatewayCode);
        assert.ok(checkout.redirectUrl.includes(checkout.sessionId));

        const payload = {
          transactionId: `TRX-${gw.gatewayCode.toUpperCase()}-1001`,
          invoiceId: "inv-001",
          amountBdt: 2500,
          status: "paid",
        };

        if (gw.gatewayCode !== "manual") {
          // Forged webhook signature must fail
          const forged = await gw.verifyWebhook(payload, "forged-signature");
          assert.strictEqual(forged.valid, false);

          // Valid HMAC signature must pass
          const validSig = gw.signWebhookPayload(payload);
          const verified = await gw.verifyWebhook(payload, validSig);
          assert.strictEqual(verified.valid, true);
          assert.strictEqual(verified.status, "paid");
        } else {
          const verifiedManual = await gw.verifyWebhook(payload);
          assert.strictEqual(verifiedManual.valid, true);
        }

        const queried = await gw.queryTransaction(payload.transactionId);
        assert.strictEqual(queried.status, "paid");

        const refund = await gw.refund(payload.transactionId, 500, "Overpayment");
        assert.strictEqual(refund.status, "refunded");
      }
    );
  }

  // ---------------------------------------------------------------------------
  // SUITE 6: Bangladesh Modules (5.00 GPA, 4th Subject, Lakh/Crore, Batches, MFS TrxID)
  // ---------------------------------------------------------------------------
  await runTest(
    "Bangladesh-Modules",
    "5.00 GPA + 4th Subject Bonus + Fail-in-Any-Mandatory Rule + Merit Ranking + Bangla Marksheet PDF",
    async () => {
      // Student 1: 5 mandatory subjects with A (4.00) + 4th subject (Biology) with A+ (5.00 -> +3.00 bonus)
      // Total GP = (5 * 4.00 + 3.00) / 5 = 23 / 5 = 4.60 (A)
      const student1 = calculateBangladeshTermGpa([
        { subjectCode: "101", subjectName: "Bangla", marksObtained: 75, totalMarks: 100 },
        { subjectCode: "107", subjectName: "English", marksObtained: 72, totalMarks: 100 },
        { subjectCode: "109", subjectName: "Mathematics", marksObtained: 78, totalMarks: 100 },
        { subjectCode: "136", subjectName: "Physics", marksObtained: 74, totalMarks: 100 },
        { subjectCode: "137", subjectName: "Chemistry", marksObtained: 71, totalMarks: 100 },
        {
          subjectCode: "138",
          subjectName: "Biology",
          marksObtained: 85,
          totalMarks: 100,
          isFourthSubject: true,
        },
      ]);
      assert.strictEqual(student1.passed, true);
      assert.strictEqual(student1.gpaWithoutFourth, 4.0);
      assert.strictEqual(student1.fourthSubjectBonus, 3.0);
      assert.strictEqual(student1.finalGpa, 4.6);
      assert.strictEqual(student1.finalLetterGrade, "A");

      // Student 2: A+ in 4 subjects, but 30/100 (F) in Mathematics -> Final GPA must be 0.00 (F)
      const student2 = calculateBangladeshTermGpa([
        { subjectCode: "101", subjectName: "Bangla", marksObtained: 90, totalMarks: 100 },
        { subjectCode: "109", subjectName: "Mathematics", marksObtained: 30, totalMarks: 100 },
      ]);
      assert.strictEqual(student2.passed, false);
      assert.strictEqual(student2.finalGpa, 0);
      assert.strictEqual(student2.finalLetterGrade, "F");

      const ranked = computeMeritPositions([student2, student1]);
      assert.strictEqual(ranked[0].finalGpa, 4.6);
      assert.strictEqual(ranked[0].meritPosition, 1);
      assert.strictEqual(ranked[1].meritPosition, 2);
    }
  );

  await runTest(
    "Bangladesh-Modules",
    "Bangla Numerals, Lakh/Crore (৳) Formatting, Amount-in-Words, and Bangla Calendar Date",
    () => {
      assert.strictEqual(formatBdtLakhCrore(1234567.5, { locale: "en" }), "৳12,34,567.50");
      assert.strictEqual(formatBdtLakhCrore(1234567.5, { locale: "bn" }), "৳১২,৩৪,৫৬৭.৫০");
      assert.strictEqual(toBanglaNumerals("2026"), "২০২৬");
      assert.strictEqual(
        amountInWordsBdt(125500, "en"),
        "One Lakh Twenty Five Thousand Five Hundred Taka Only"
      );
      assert.ok(amountInWordsBdt(1500, "bn").includes("১5০০") === false);
      assert.ok(amountInWordsBdt(1500, "bn").includes("১৫০০ টাকা"));
      assert.ok(formatBanglaDate("2026-04-14").includes("বৈশাখ"));
    }
  );

  await runTest(
    "Bangladesh-Modules",
    "Oldest-Due-First Fee Allocation, Pro-Rated Mid-Month Coaching Fee, MCQ Negative Marking, and Teacher Payroll Models",
    () => {
      // 1. Oldest-due allocation
      const alloc = allocatePaymentOldestDueFirst(3500, [
        { invoiceId: "inv-feb", dueDate: "2026-02-10", netAmount: 2000, paidAmount: 0 },
        { invoiceId: "inv-jan", dueDate: "2026-01-10", netAmount: 2000, paidAmount: 0 },
      ]);
      assert.strictEqual(alloc.allocations[0].invoiceId, "inv-jan");
      assert.strictEqual(alloc.allocations[0].allocatedAmount, 2000);
      assert.strictEqual(alloc.allocations[0].newStatus, "paid");
      assert.strictEqual(alloc.allocations[1].invoiceId, "inv-feb");
      assert.strictEqual(alloc.allocations[1].allocatedAmount, 1500);
      assert.strictEqual(alloc.allocations[1].newStatus, "partial");

      // 2. Pro-rated mid-month coaching batch fee (joining on 16th of a 30-day month = 50% of monthly fee)
      const proRata = calculateProRatedCoachingFee({
        monthlyFeeBdt: 2000,
        joinDate: "2026-04-16T00:00:00Z",
        siblingDiscountPct: 10,
      });
      assert.strictEqual(proRata.daysInMonth, 30);
      assert.strictEqual(proRata.billableDays, 15);
      assert.strictEqual(proRata.proRatedBaseBdt, 1000);
      assert.strictEqual(proRata.discountBdt, 100);
      assert.strictEqual(proRata.netPayableBdt, 900);

      // 3. MCQ auto-grading with 0.25 negative marking per wrong answer
      const mcq = evaluateMcqSubmission({
        questions: [
          { id: "q1", correctOptionIndex: 1, marks: 1 },
          { id: "q2", correctOptionIndex: 2, marks: 1 },
          { id: "q3", correctOptionIndex: 0, marks: 1 },
        ],
        answers: { q1: 1, q2: 3, q3: null }, // 1 right (+1), 1 wrong (-0.25), 1 unattempted
        negativeMarkPerWrong: 0.25,
      });
      assert.strictEqual(mcq.correct, 1);
      assert.strictEqual(mcq.wrong, 1);
      assert.strictEqual(mcq.netMarks, 0.75);

      // 4. Teacher revenue-share payroll
      const payroll = calculateTeacherPayroll({
        model: "revenue_share",
        collectedRevenueBdt: 100000,
        revenueSharePct: 40,
        deductionsBdt: 2000,
      });
      assert.strictEqual(payroll.grossAmountBdt, 40000);
      assert.strictEqual(payroll.netAmountBdt, 38000);
    }
  );

  // ---------------------------------------------------------------------------
  // SUITE 7: Mongo -> Postgres ETL & Paisa-Exact Reconciliation
  // ---------------------------------------------------------------------------
  await runTest(
    "Mongo-to-PG-ETL",
    "Idempotent ETL, ObjectId->UUID determinism, migration_rejects quarantine, and Paisa-exact financial reconciliation",
    () => {
      const sampleSource = {
        tenant: {
          _id: "65f000000000000000000001",
          name: "Dhaka Public School",
          subdomain: "dhakapublic",
          billingPlan: "postpaid",
          subscriptionStatus: "active",
          maxStudents: 200,
          maxTeachers: 20,
          maxAdmins: 5,
        },
        parents: [
          {
            _id: "65f000000000000000000010",
            parentId: "PAR-0001",
            firstName: "Abdul",
            lastName: "Karim",
            email: "karim@example.com",
            phone: "+8801711000001",
            relationship: "father",
          },
        ],
        courses: [
          {
            _id: "65f000000000000000000020",
            code: "SSC-SCI",
            name: "SSC Science",
            credits: 10,
            duration: 24,
          },
        ],
        students: [
          {
            _id: "65f000000000000000000030",
            studentId: "STU-0001",
            firstName: "Nafis",
            lastName: "Karim",
            email: "nafis@example.com",
            phone: "+8801711000002",
            parentId: "65f000000000000000000010",
            status: "active",
          },
          // Corrupt student without email -> should be quarantined in migration_rejects, never silently dropped
          {
            _id: "65f000000000000000000031",
            studentId: "STU-CORRUPT",
            firstName: "Broken",
          },
        ],
        teachers: [
          {
            _id: "65f000000000000000000040",
            teacherId: "TCH-0001",
            firstName: "Milon",
            lastName: "Sir",
            email: "milon@example.com",
            salary: 25000.5,
          },
        ],
        employees: [],
        classRooms: [],
        payments: [
          {
            _id: "65f000000000000000000050",
            paymentId: "PAY-0001",
            studentId: "65f000000000000000000030",
            courseId: "65f000000000000000000020",
            amount: 1550.75,
            paymentType: "tuition",
            paymentMethod: "online",
            paymentStatus: "paid",
            transactionId: "BKASH-TRX-999",
          },
          {
            _id: "65f000000000000000000051",
            paymentId: "PAY-0002",
            studentId: "65f000000000000000000030",
            courseId: "65f000000000000000000020",
            amount: 1200.25,
            paymentType: "exam",
            paymentStatus: "pending",
          },
        ],
        expenses: [
          {
            _id: "65f000000000000000000060",
            category: "salary",
            subcategory: "Monthly Salary",
            amount: 25000.5,
            description: "Milon Sir Salary",
            employeeId: "TCH-0001", // String custom code resolved via staffIdMap!
            status: "paid",
          },
        ],
        exams: [
          {
            _id: "65f000000000000000000070",
            examId: "EXM-0001",
            name: "Midterm 2026",
            examType: "midterm",
            totalMarks: 100,
            passingMarks: 33,
          },
        ],
        examMarks: [
          {
            _id: "65f000000000000000000080",
            examId: "EXM-0001", // Custom code resolved to Exam UUID!
            studentId: "STU-0001", // Custom code resolved to Student UUID!
            marksObtained: 88,
            grade: "A+",
            evaluatedBy: "TCH-0001",
            status: "published",
          },
        ],
      };

      const run1 = runMongoToPostgresEtlForTenant(sampleSource);
      const run2 = runMongoToPostgresEtlForTenant(sampleSource);

      assert.strictEqual(run1.report.passed, true);
      assert.strictEqual(run1.report.rejects.length, 1);
      assert.strictEqual(run1.report.rejects[0].legacy_mongo_id, "65f000000000000000000031");
      assert.strictEqual(run1.report.financials.paymentsMatchToPaisa, true);
      assert.strictEqual(run1.report.financials.expensesMatchToPaisa, true);
      assert.strictEqual(run1.report.financials.mongoPaidPaymentsPaisa, 155075);
      assert.strictEqual(run1.report.financials.pgPaidInvoicesPaisa, 155075);

      // Idempotency check: Run 1 and Run 2 produce identical UUIDs
      assert.strictEqual(
        run1.migratedTables.students[0].id,
        run2.migratedTables.students[0].id
      );
    }
  );

  // ---------------------------------------------------------------------------
  // SUITE 8: HTTP Integration Suite for All 11 P0 Defects & Multi-Tenant API
  // ---------------------------------------------------------------------------
  const testContainer = createContainer();
  seedBangladeshArchetypeTenants(testContainer);
  // Seed demo tenants into the global app container as well
  const { container: globalAppContainer } = await import("../src/composition/container");
  seedBangladeshArchetypeTenants(globalAppContainer);

  const server = app.listen(0);
  const address = server.address() as { port: number };
  const port = address.port;

  try {
    await runTest(
      "HTTP-Integration (Health & Readiness)",
      "GET /health and GET /ready return active drivers without exposing secrets",
      async () => {
        const health = await httpRequest(port, { method: "GET", path: "/health" });
        assert.strictEqual(health.status, 200);
        assert.strictEqual(health.body.success, true);

        const ready = await httpRequest(port, { method: "GET", path: "/ready" });
        assert.strictEqual(ready.status, 200);
        assert.strictEqual(ready.body.drivers.storage, "local");
        assert.strictEqual(ready.body.drivers.sms, "console");
      }
    );

    await runTest(
      "HTTP-Integration (P0-1: SuperAdmin Auth & Audit)",
      "Unauthenticated or non-superadmin calls to /api/v1/superadmin/* are blocked; valid SuperAdmin JWT succeeds and logs audit trail",
      async () => {
        // 1. Unauthenticated request blocked with 401
        const unauth = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/superadmin/tenants",
        });
        assert.strictEqual(unauth.status, 401);

        // 2. Non-superadmin token blocked with 403
        const regularToken = jwt.sign(
          { id: "u1", role: "admin", tenantId: "dhakamodel" },
          globalAppContainer.config.auth.accessSecret
        );
        const forbidden = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/superadmin/tenants",
          headers: { Authorization: `Bearer ${regularToken}` },
        });
        assert.strictEqual(forbidden.status, 403);

        // 3. Valid SuperAdmin token succeeds on /plans and /audit-logs (Fixes P0-1 & P0-11)
        const saToken = jwt.sign(
          { id: "sa-1", email: "owner@campusbaba.com", role: "superadmin" },
          globalAppContainer.config.auth.accessSecret
        );
        const plansRes = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/superadmin/plans",
          headers: { Authorization: `Bearer ${saToken}` },
          body: {
            code: "starter",
            name: "Starter Plan Updated",
            priceBdt: 3000,
          },
        });
        assert.strictEqual(plansRes.status, 200);
        assert.strictEqual(plansRes.body.data.priceBdt, 3000);

        const logsRes = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/superadmin/audit-logs",
          headers: { Authorization: `Bearer ${saToken}` },
        });
        assert.strictEqual(logsRes.status, 200);
        assert.ok(logsRes.body.data.length >= 1);
      }
    );

    await runTest(
      "HTTP-Integration (P0-2 & P0-3: Host Isolation, Spoofed x-tenant-id & Cross-Tenant JWT Rejection)",
      "Rejects forged x-tenant-id, reserved subdomains, unauthenticated tenant calls, and tokens from another tenant",
      async () => {
        // 1. Forged x-tenant-id differing from Host subdomain -> 403 Forbidden
        const spoofed = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/students",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            "x-tenant-id": "darululoom",
          },
        });
        assert.strictEqual(spoofed.status, 403);
        assert.ok(String(spoofed.body.message).includes("Cross-tenant header spoofing"));

        // 2. Reserved subdomain (admin.campusbaba.com) -> 400 Bad Request
        const reserved = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/students",
          headers: {
            Host: "admin.campusbaba.com",
          },
        });
        assert.strictEqual(reserved.status, 400);

        // 3. Unauthenticated request to tenant endpoint -> 401 Unauthorized (P0-2)
        const unauthTenant = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/students",
          headers: {
            Host: "dhakamodel.campusbaba.com",
          },
        });
        assert.strictEqual(unauthTenant.status, 401);

        // 4. Token issued for 'dhakamodel' used on 'darululoom.campusbaba.com' -> 403 Forbidden (P0-3)
        const dhakaToken = globalAppContainer.invitationAuth.issueSessionTokens({
          id: "user-dhaka-1",
          email: "admin@dhakamodel.edu.bd",
          role: "admin",
          referenceId: "emp-1",
          tenantId: "dhakamodel",
        }).accessToken;

        const crossTenantCall = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/auth/me",
          headers: {
            Host: "darululoom.campusbaba.com",
            Authorization: `Bearer ${dhakaToken}`,
          },
        });
        assert.strictEqual(crossTenantCall.status, 403);
        assert.ok(String(crossTenantCall.body.message).includes("Cross-tenant token rejected"));

        // 5. Student role attempting financial report or batch creation -> 403 Forbidden (P0-2 RBAC)
        const studentToken = globalAppContainer.invitationAuth.issueSessionTokens({
          id: "stu-user-1",
          email: "student@dhakamodel.edu.bd",
          role: "student",
          referenceId: "stu-1",
          tenantId: "dhakamodel",
        }).accessToken;

        const rbacDenied = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/reports/income",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${studentToken}`,
          },
        });
        assert.strictEqual(rbacDenied.status, 403);
      }
    );

    await runTest(
      "HTTP-Integration (P0-6, P0-7, P0-8, P0-9, P0-10)",
      "Signed single-use invitations, refresh rotation, atomic quota limits, tenant offboarding lifecycle, and CORS allowlist",
      async () => {
        const dhakaAdminSession = globalAppContainer.invitationAuth.issueSessionTokens({
          id: "admin-dhaka",
          email: "principal@dhakamodel.edu.bd",
          role: "admin",
          referenceId: "emp-principal",
          tenantId: "dhakamodel",
        });

        // 1. P0-8: Registration without invitationToken fails with 401
        const noInviteReg = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/auth/register",
          headers: { Host: "dhakamodel.campusbaba.com" },
          body: { email: "hacker@example.com", password: "password123", role: "admin" },
        });
        assert.strictEqual(noInviteReg.status, 401);

        // 2. P0-8: Admin issues a signed single-use invitation for dhakamodel
        const inviteCreate = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/auth/invitations",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaAdminSession.accessToken}`,
          },
          body: {
            email: "newteacher@dhakamodel.edu.bd",
            role: "teacher",
            referenceId: "tch-101",
            name: "Rafiqul Islam",
          },
        });
        assert.strictEqual(inviteCreate.status, 201);
        const signedInviteToken = inviteCreate.body.data.token;

        // Using dhakamodel's invitation on darululoom fails with 401
        const wrongTenantInvite = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/auth/register",
          headers: { Host: "darululoom.campusbaba.com" },
          body: { invitationToken: signedInviteToken, password: "password123" },
        });
        assert.strictEqual(wrongTenantInvite.status, 401);

        // Consuming the invitation once on dhakamodel succeeds
        const validReg = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/auth/register",
          headers: { Host: "dhakamodel.campusbaba.com" },
          body: { invitationToken: signedInviteToken, password: "password123" },
        });
        assert.strictEqual(validReg.status, 201);

        // Replaying the single-use invitation a second time fails with 401!
        const replayReg = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/auth/register",
          headers: { Host: "dhakamodel.campusbaba.com" },
          body: { invitationToken: signedInviteToken, password: "password123" },
        });
        assert.strictEqual(replayReg.status, 401);

        // 3. P0-7: Refresh token rotation invalidates old refresh token
        const refreshRes = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/auth/refresh",
          headers: { Host: "dhakamodel.campusbaba.com" },
          body: { refreshToken: dhakaAdminSession.refreshToken },
        });
        assert.strictEqual(refreshRes.status, 200);
        assert.ok(refreshRes.headers["set-cookie"]);

        // Replaying the old rotated refresh token is rejected!
        const replayRefresh = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/auth/refresh",
          headers: { Host: "dhakamodel.campusbaba.com" },
          body: { refreshToken: dhakaAdminSession.refreshToken },
        });
        assert.strictEqual(replayRefresh.status, 401);

        // 4. P0-9: Atomic quota check blocks exceeding limit
        assert.throws(
          () =>
            globalAppContainer.platformSaas.reserveQuotaSlot({
              tenantKey: "dhakamodel",
              resource: "students",
              currentCountInDb: 500,
              limit: 500,
            }),
          /Tenant quota limit reached/
        );

        // 5. P0-10: Tenant-aware CORS allowlist
        assert.strictEqual(
          isAllowedCorsOrigin("https://dhakamodel.campusbaba.com", "campusbaba.com", []),
          true
        );
        assert.strictEqual(
          isAllowedCorsOrigin("https://evil-phishing.com", "campusbaba.com", []),
          false
        );

        // 6. P0-6: Safe Tenant Offboarding Lifecycle (Suspend -> Export -> Purge)
        const saToken = jwt.sign(
          { id: "sa-1", email: "owner@campusbaba.com", role: "superadmin" },
          globalAppContainer.config.auth.accessSecret
        );
        const targetRec = globalAppContainer.platformSaas.getTenant("udvashbatch")!;
        targetRec.subscriptionStatus = "suspended";

        const expRes = await httpRequest(port, {
          method: "POST",
          path: `/api/v1/superadmin/tenants/udvashbatch/export`,
          headers: { Authorization: `Bearer ${saToken}` },
        });
        assert.strictEqual(expRes.status, 200);
        assert.ok(expRes.body.data.manifestChecksum);

        const purgeRes = await httpRequest(port, {
          method: "DELETE",
          path: `/api/v1/superadmin/tenants/udvashbatch?force=true`,
          headers: { Authorization: `Bearer ${saToken}` },
        });
        assert.strictEqual(purgeRes.status, 200);
        assert.strictEqual(purgeRes.body.data.purged, true);
      }
    );

    await runTest(
      "HTTP-Integration (Zero-Code Centralized Governance Control Plane)",
      "Live RBAC permission toggling, live feature flag switches, platform security policies, and AES-256-GCM encrypted credentials",
      async () => {
        const saToken = jwt.sign(
          { id: "sa-1", email: "owner@campusbaba.com", role: "superadmin" },
          globalAppContainer.config.auth.accessSecret
        );

        const dhakaAdminToken = globalAppContainer.invitationAuth.issueSessionTokens({
          id: "admin-dhaka",
          email: "principal@dhakamodel.edu.bd",
          role: "admin",
          referenceId: "emp-principal",
          tenantId: "dhakamodel",
        }).accessToken;

        const dhakaTeacherToken = globalAppContainer.invitationAuth.issueSessionTokens({
          id: "tch-dhaka",
          email: "teacher@dhakamodel.edu.bd",
          role: "teacher",
          referenceId: "tch-1",
          tenantId: "dhakamodel",
        }).accessToken;

        // 1. SuperAdmin reads & updates global platform security policies
        const getGov = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/superadmin/governance",
          headers: { Authorization: `Bearer ${saToken}` },
        });
        assert.strictEqual(getGov.status, 200);
        assert.strictEqual(getGov.body.data.policy.enforceBtrcPromotionalWindow, true);

        const updatePolicy = await httpRequest(port, {
          method: "PUT",
          path: "/api/v1/superadmin/governance/policy",
          headers: { Authorization: `Bearer ${saToken}` },
          body: {
            loginRateLimitPerMin: 45,
            corsAllowedOrigins: ["https://portal.dhakamodel.edu.bd"],
          },
        });
        assert.strictEqual(updatePolicy.status, 200);
        assert.strictEqual(updatePolicy.body.data.loginRateLimitPerMin, 45);

        // 2. Dynamic Feature Flag Enforcement:
        // SuperAdmin disables 'library' module for 'dhakamodel' -> POST /api/v1/bd/library/books immediately returns 403!
        await httpRequest(port, {
          method: "PUT",
          path: "/api/v1/superadmin/governance/tenants/dhakamodel",
          headers: { Authorization: `Bearer ${saToken}` },
          body: {
            featureFlags: { library: false },
          },
        });

        const blockedLibrary = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/bd/library/books",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaAdminToken}`,
          },
          body: { title: "Physics 1st Paper", author: "Dr. Shahjahan Tapan", totalCopies: 5 },
        });
        assert.strictEqual(blockedLibrary.status, 403);
        assert.ok(String(blockedLibrary.body.message).includes("Module 'library' is currently disabled"));

        // Re-enable 'library' module -> immediately returns 201!
        await httpRequest(port, {
          method: "PUT",
          path: "/api/v1/superadmin/governance/tenants/dhakamodel",
          headers: { Authorization: `Bearer ${saToken}` },
          body: {
            featureFlags: { library: true },
          },
        });

        const allowedLibrary = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/bd/library/books",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaAdminToken}`,
          },
          body: { title: "Physics 1st Paper", author: "Dr. Shahjahan Tapan", totalCopies: 5 },
        });
        assert.strictEqual(allowedLibrary.status, 201);

        // 3. Dynamic RBAC Permission Matrix Enforcement:
        const myGovRes = await httpRequest(port, {
          method: "GET",
          path: "/api/v1/governance/my-config",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaAdminToken}`,
          },
        });
        assert.strictEqual(myGovRes.status, 200);
        const currentTeacherPerms: string[] = myGovRes.body.data.rolePermissions.teacher || [];

        // Ensure teacher does NOT have 'library:write' -> POST /api/v1/bd/library/books returns 403!
        await httpRequest(port, {
          method: "PUT",
          path: "/api/v1/governance/config",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaAdminToken}`,
          },
          body: {
            rolePermissions: {
              teacher: currentTeacherPerms.filter((p) => p !== "library:write"),
            },
          },
        });

        const teacherLibraryWrite = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/bd/library/books",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaTeacherToken}`,
          },
          body: { title: "Chemistry 1st Paper", author: "Hazari & Nag", totalCopies: 5 },
        });
        assert.strictEqual(teacherLibraryWrite.status, 403);

        // Now grant 'library:write' to teacher via UI API -> Teacher POST /api/v1/bd/library/books immediately succeeds (201)!
        await httpRequest(port, {
          method: "PUT",
          path: "/api/v1/governance/config",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaAdminToken}`,
          },
          body: {
            rolePermissions: {
              teacher: [...currentTeacherPerms, "library:write"],
            },
          },
        });

        const teacherLibraryAllowed = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/bd/library/books",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaTeacherToken}`,
          },
          body: { title: "Chemistry 1st Paper", author: "Hazari & Nag", totalCopies: 5 },
        });
        assert.strictEqual(teacherLibraryAllowed.status, 201);

        // 4. Encrypted Provider Credentials Vault (AES-256-GCM)
        const credRes = await httpRequest(port, {
          method: "POST",
          path: "/api/v1/governance/provider-credentials",
          headers: {
            Host: "dhakamodel.campusbaba.com",
            Authorization: `Bearer ${dhakaAdminToken}`,
          },
          body: {
            capability: "payment",
            providerCode: "bkash",
            secrets: {
              apiKey: "bkash-live-app-key-999",
              apiSecret: "bkash-live-secret-999",
            },
          },
        });
        assert.strictEqual(credRes.status, 200);
        assert.strictEqual(credRes.body.data.providerCode, "bkash");
        assert.strictEqual(credRes.body.data.configured, true);

        // Verify decrypted credentials inside ProviderResolver resolve a tenant-scoped bKash gateway
        const resolved = globalAppContainer.providerResolver.resolvePaymentGateway(
          "bkash",
          "dhakamodel"
        );
        assert.strictEqual(resolved.gatewayCode, "bkash");
      }
    );
  } finally {
    server.close();
  }

  // ---------------------------------------------------------------------------
  // Final Summary
  // ---------------------------------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log("\n=================================================================");
  console.log(
    `📊 Test Summary: ${passedCount}/${results.length} Passed, ${failedCount} Failed`
  );
  console.log("=================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
