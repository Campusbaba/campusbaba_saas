"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFileUpload } from "@/hooks/useFileUpload";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

interface FileViewerProps {
  fileId: string;
  label?: string;
}

/**
 * FileViewer Component
 * Requests a short-lived, tenant-authorized signed download URL from the API
 * before opening or downloading private Cloudflare R2 / StoragePort objects.
 */
export function FileViewer({ fileId, label = "View Document" }: FileViewerProps) {
  const { getDownloadUrl } = useFileUpload();
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setLoading(true);
    try {
      const signedUrl = await getDownloadUrl(fileId);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error(err.message || "Unable to open document");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleOpen}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <FileText size={14} />
      )}
      <span>{label}</span>
      <Download size={13} className="opacity-70" />
    </Button>
  );
}
