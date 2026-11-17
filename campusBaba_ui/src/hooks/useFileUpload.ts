"use client";

import { useState, useCallback } from "react";
import api from "@/lib/axios";

export interface UploadedFileMetadata {
  fileId: string;
  objectKey: string;
  uploadUrl: string;
  platformAlertLevel: "normal" | "warning_70" | "critical_90";
}

/**
 * Shared File Upload Hook (Cloudflare R2 / StoragePort)
 * - Requests a short-lived signed upload URL from `/api/v1/bd/files/upload-url`
 * - Uploads directly to the signed URL (or uses `/api/v1/bd/files/upload-direct` for verified server-side uploads)
 */
export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestSignedUploadUrl = useCallback(
    async (params: {
      module: string;
      entityType: string;
      entityId: string;
      file: File;
      isSensitive?: boolean;
    }): Promise<UploadedFileMetadata> => {
      setUploading(true);
      setError(null);
      try {
        const res = await api.post("/bd/files/upload-url", {
          module: params.module,
          entityType: params.entityType,
          entityId: params.entityId,
          originalName: params.file.name,
          mimeType: params.file.type,
          sizeBytes: params.file.size,
          isSensitive: params.isSensitive,
        });

        const data: UploadedFileMetadata & { headers?: Record<string, string> } =
          res.data.data;

        await fetch(data.uploadUrl, {
          method: "PUT",
          headers: data.headers || { "Content-Type": params.file.type },
          body: params.file,
        });

        return data;
      } catch (err: any) {
        const msg = err.message || "File upload failed";
        setError(msg);
        throw new Error(msg);
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const getDownloadUrl = useCallback(async (fileId: string): Promise<string> => {
    const res = await api.get(`/bd/files/${fileId}/download-url`);
    return res.data.data.downloadUrl;
  }, []);

  return {
    uploading,
    error,
    requestSignedUploadUrl,
    getDownloadUrl,
  };
}
