import { useState } from "react";
import { callCallableEndpoint } from "../callable.ts";
import type {
  CreateFeedbackAttachmentUploadRequest,
  CreateFeedbackAttachmentUploadResponse,
  FeedbackAttachmentMetadata,
  FinalizeFeedbackAttachmentResponse,
} from "../../contracts/apiContracts.ts";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_IMAGE_DIMENSION = 1600;

export type StagedFeedbackAttachment = {
  id: string;
  file: File;
  status: "staged" | "uploading" | "uploaded" | "failed";
  progress: number;
  error?: string;
  attachment?: FeedbackAttachmentMetadata;
};

export function validateFeedbackAttachmentFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Only PNG, JPEG, or WebP screenshots are supported.");
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new Error("Screenshot must be 5MB or less.");
  }
}

async function compressImageForFeedback(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.82);
    });
    if (!blob || blob.size <= 0 || blob.size >= file.size) {
      return file;
    }
    const baseName = file.name.replace(/\.[^.]+$/, "") || "screenshot";
    return new File([blob], `${baseName}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}

export const useFeedbackAttachmentUpload = () => {
  const [isUploading, setIsUploading] = useState(false);

  const uploadAttachments = async (
    feedbackId: string,
    files: File[],
    onProgress?: (fileName: string, progress: number) => void
  ): Promise<FeedbackAttachmentMetadata[]> => {
    if (files.length === 0) return [];
    if (files.length > 3) throw new Error("Feedback supports up to 3 screenshots.");

    setIsUploading(true);
    try {
      const uploaded: FeedbackAttachmentMetadata[] = [];
      for (const file of files) {
        const uploadFile = await compressImageForFeedback(file);
        validateFeedbackAttachmentFile(uploadFile);
        onProgress?.(file.name, 10);
        const token = await callCallableEndpoint<
          CreateFeedbackAttachmentUploadRequest,
          CreateFeedbackAttachmentUploadResponse
        >("createFeedbackAttachmentUpload", {
          feedbackId,
          fileName: uploadFile.name,
          contentType: uploadFile.type as "image/png" | "image/jpeg" | "image/webp",
          size: uploadFile.size,
        });

        onProgress?.(file.name, 45);
        const response = await fetch(token.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": uploadFile.type },
          body: uploadFile,
        });
        if (!response.ok) {
          throw new Error(`Screenshot upload failed with status ${response.status}.`);
        }

        onProgress?.(file.name, 80);
        const finalized = await callCallableEndpoint<
          { feedbackId: string; attachmentId: string },
          FinalizeFeedbackAttachmentResponse
        >("finalizeFeedbackAttachment", {
          feedbackId,
          attachmentId: token.attachmentId,
        });
        uploaded.push(finalized.attachment);
        onProgress?.(file.name, 100);
      }
      return uploaded;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadAttachments, isUploading };
};
