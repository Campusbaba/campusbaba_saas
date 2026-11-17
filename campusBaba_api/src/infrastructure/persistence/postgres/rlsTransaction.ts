import { AsyncLocalStorage } from "async_hooks";
import crypto from "crypto";
import { TENANT_RLS_TABLES, TenantRlsTableName } from "./schema";

export interface RlsRequestContext {
  tenantId: string;
  tenantSlug?: string;
  actorUserId?: string;
  actorRole?: string;
  impersonatedByAdminId?: string;
  requestId: string;
}

export const rlsContextStore = new AsyncLocalStorage<RlsRequestContext>();

/**
 * Enforces PostgreSQL Row-Level Security (RLS) semantics (`app.current_tenant`)
 * both when generating SQL transactions (`SET LOCAL app.current_tenant = '<uuid>'`)
 * and in the deterministic RLS Store used by repository & isolation tests.
 */
export class RlsTenantStore {
  private readonly tables = new Map<TenantRlsTableName, Map<string, Record<string, any>>>();

  constructor() {
    for (const table of TENANT_RLS_TABLES) {
      this.tables.set(table, new Map());
    }
  }

  static getCurrentTenantId(): string | null {
    const ctx = rlsContextStore.getStore();
    return ctx?.tenantId || null;
  }

  static runWithTenantContext<T>(
    context: Omit<RlsRequestContext, "requestId"> & { requestId?: string },
    fn: () => T
  ): T {
    if (!context.tenantId) {
      throw new Error("RLS Violation: tenantId is required to open a tenant transaction");
    }
    const fullContext: RlsRequestContext = {
      ...context,
      requestId: context.requestId || crypto.randomUUID(),
    };
    return rlsContextStore.run(fullContext, fn);
  }

  /**
   * Generates the exact PostgreSQL transaction prologue for PgBouncer transaction mode.
   */
  static buildSetLocalTenantSql(tenantId: string): { text: string; values: [string] } {
    if (!/^[0-9a-fA-F-]{8,64}$/.test(tenantId)) {
      throw new Error(`Invalid tenantId format for RLS SET LOCAL: ${tenantId}`);
    }
    return {
      text: "SELECT set_config('app.current_tenant', $1, true);",
      values: [tenantId],
    };
  }

  /**
   * Inserts a row into an RLS-protected table.
   * Mirrors PostgreSQL `WITH CHECK (tenant_id = current_tenant_id())`:
   * - If no `app.current_tenant` is set in AsyncLocalStorage, throws RLS error.
   * - If `row.tenant_id` is provided and differs from `app.current_tenant`, throws RLS WITH CHECK error.
   */
  insert<T extends Record<string, any>>(
    table: TenantRlsTableName,
    row: T
  ): T & { id: string; tenant_id: string } {
    const activeTenantId = RlsTenantStore.getCurrentTenantId();
    if (!activeTenantId) {
      throw new Error(
        `RLS WITH CHECK violation on table "${table}": app.current_tenant is not set`
      );
    }

    const rowTenantId = row.tenant_id || row.tenantId || activeTenantId;
    if (rowTenantId !== activeTenantId) {
      throw new Error(
        `RLS WITH CHECK violation on table "${table}": cannot insert row for tenant '${rowTenantId}' while active tenant is '${activeTenantId}'`
      );
    }

    const tableMap = this.tables.get(table);
    if (!tableMap) {
      throw new Error(`Unknown RLS table: ${table}`);
    }

    const id = row.id || crypto.randomUUID();
    const record = {
      ...row,
      id,
      tenant_id: activeTenantId,
      tenantId: activeTenantId,
      createdAt: row.createdAt || new Date(),
      updatedAt: new Date(),
    };

    tableMap.set(id, record);
    return record;
  }

  /**
   * Queries rows from an RLS-protected table.
   * Mirrors PostgreSQL `USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)`:
   * - If no `app.current_tenant` is set, returns ZERO rows (`[]`).
   * - Otherwise returns only rows matching `tenant_id === activeTenantId`.
   */
  findMany<T = Record<string, any>>(
    table: TenantRlsTableName,
    predicate?: (row: T) => boolean
  ): T[] {
    const activeTenantId = RlsTenantStore.getCurrentTenantId();
    if (!activeTenantId) {
      return []; // Fail-closed RLS behavior
    }

    const tableMap = this.tables.get(table);
    if (!tableMap) return [];

    const results: T[] = [];
    for (const row of tableMap.values()) {
      if (row.tenant_id === activeTenantId) {
        if (!predicate || predicate(row as T)) {
          results.push(row as T);
        }
      }
    }
    return results;
  }

  findById<T = Record<string, any>>(table: TenantRlsTableName, id: string): T | null {
    const activeTenantId = RlsTenantStore.getCurrentTenantId();
    if (!activeTenantId) return null;

    const tableMap = this.tables.get(table);
    const row = tableMap?.get(id);
    if (!row || row.tenant_id !== activeTenantId) {
      return null;
    }
    return row as T;
  }

  updateById<T extends Record<string, any>>(
    table: TenantRlsTableName,
    id: string,
    patch: Partial<T>
  ): T | null {
    const activeTenantId = RlsTenantStore.getCurrentTenantId();
    if (!activeTenantId) return null;

    const tableMap = this.tables.get(table);
    const existing = tableMap?.get(id);
    if (!existing || existing.tenant_id !== activeTenantId) {
      return null; // Invisible under RLS USING policy
    }

    if (
      (patch.tenant_id && patch.tenant_id !== activeTenantId) ||
      (patch.tenantId && patch.tenantId !== activeTenantId)
    ) {
      throw new Error(
        `RLS WITH CHECK violation on table "${table}": cannot reassign tenant_id`
      );
    }

    const updated = {
      ...existing,
      ...patch,
      id,
      tenant_id: activeTenantId,
      tenantId: activeTenantId,
      updatedAt: new Date(),
    };
    tableMap!.set(id, updated);
    return updated as unknown as T;
  }

  deleteById(table: TenantRlsTableName, id: string): boolean {
    const activeTenantId = RlsTenantStore.getCurrentTenantId();
    if (!activeTenantId) return false;

    const tableMap = this.tables.get(table);
    const existing = tableMap?.get(id);
    if (!existing || existing.tenant_id !== activeTenantId) {
      return false;
    }
    return tableMap!.delete(id);
  }

  /**
   * Platform Admin Purge (Requires explicit tenantId verification)
   */
  purgeTenantDataAsAdmin(tenantId: string): number {
    let totalPurged = 0;
    for (const tableMap of this.tables.values()) {
      for (const [id, row] of Array.from(tableMap.entries())) {
        if (row.tenant_id === tenantId) {
          tableMap.delete(id);
          totalPurged++;
        }
      }
    }
    return totalPurged;
  }
}
