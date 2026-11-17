import { StoragePort } from "../../campusBaba_api/src/ports/StoragePort";
import { FileMetadataRecord } from "../../campusBaba_api/src/application/services/FileStorageService";

/**
 * Storage Driver Migration Tool (`tools/storage-migrate`)
 * Copies tenant objects between any two StoragePort drivers (e.g. local <-> MinIO <-> R2 <-> S3)
 * using the `files` table metadata as the source of truth and verifying byte sizes.
 */
export async function migrateStorageObjectsBetweenDrivers(params: {
  sourceDriver: StoragePort;
  targetDriver: StoragePort;
  files: FileMetadataRecord[];
}): Promise<{
  totalFiles: number;
  migratedCount: number;
  bytesTransferred: number;
}> {
  let migratedCount = 0;
  let bytesTransferred = 0;

  for (const file of params.files) {
    if (file.status !== "ready") continue;

    const buffer = await params.sourceDriver.getObjectBuffer(file.object_key, {
      tenantId: file.tenant_id,
    });

    await params.targetDriver.putObject(file.object_key, buffer, {
      contentType: file.mime_type,
      sizeBytes: buffer.length,
      tenantId: file.tenant_id,
    });

    const verifiedHead = await params.targetDriver.headObject(file.object_key, {
      tenantId: file.tenant_id,
    });

    if (!verifiedHead || verifiedHead.sizeBytes !== buffer.length) {
      throw new Error(
        `Storage migration verification failed for key '${file.object_key}'`
      );
    }

    migratedCount++;
    bytesTransferred += buffer.length;
  }

  return {
    totalFiles: params.files.length,
    migratedCount,
    bytesTransferred,
  };
}
