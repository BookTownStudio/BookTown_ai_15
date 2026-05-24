import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as logger from "firebase-functions/logger";
import sharp from "sharp";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";

type DerivativeSize = "thumb" | "feed" | "large";
type RenditionSize = "original" | DerivativeSize;

type AttachmentSourcePath = {
  uid: string;
  attachmentId: string;
  filename: string;
};

type MediaRenditionMetadata = {
  storagePath: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
};

const DERIVATIVE_CONFIGS: Record<
  DerivativeSize,
  { width: number; quality: number }
> = {
  thumb: { width: 320, quality: 74 },
  feed: { width: 1200, quality: 80 },
  large: { width: 2400, quality: 84 },
};

const DERIVATIVE_FOLDERS = new Set<string>(["original", "thumb", "feed", "large"]);

function readNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAttachmentSourcePath(path: string): AttachmentSourcePath | null {
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 4) return null;
  const [root, uid, attachmentId, filename] = segments;
  if (root !== "attachments" || !uid || !attachmentId || !filename) return null;
  if (!attachmentId.startsWith("att_")) return null;
  if (DERIVATIVE_FOLDERS.has(filename)) return null;
  return { uid, attachmentId, filename };
}

function derivativePath(
  source: AttachmentSourcePath,
  size: DerivativeSize
): string {
  const baseName = source.filename.replace(/\.[^.]+$/, "") || source.attachmentId;
  return `attachments/${source.uid}/${source.attachmentId}/${size}/${baseName}.webp`;
}

function sourcePath(source: AttachmentSourcePath): string {
  return `attachments/${source.uid}/${source.attachmentId}/${source.filename}`;
}

function aspectRatio(width: number, height: number): number {
  return height > 0 ? Number((width / height).toFixed(6)) : 0;
}

async function storageFileExists(
  bucket: ReturnType<ReturnType<typeof admin.storage>["bucket"]>,
  path: string
): Promise<boolean> {
  const [exists] = await bucket.file(path).exists();
  return exists;
}

async function saveDerivative(params: {
  bucket: ReturnType<ReturnType<typeof admin.storage>["bucket"]>;
  source: AttachmentSourcePath;
  size: DerivativeSize;
  originalBytes: Buffer;
  contentDisposition?: string;
}): Promise<MediaRenditionMetadata> {
  const { bucket, contentDisposition, originalBytes, size, source } = params;
  const outputPath = derivativePath(source, size);

  if (await storageFileExists(bucket, outputPath)) {
    return readImageRenditionMetadata({
      bucket,
      path: outputPath,
      size,
    });
  }

  const config = DERIVATIVE_CONFIGS[size];
  const { data, info } = await sharp(originalBytes, { failOn: "none" })
    .rotate()
    .resize({ width: config.width, withoutEnlargement: true })
    .webp({ quality: config.quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  await bucket.file(outputPath).save(data, {
    contentType: "image/webp",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
      ...(contentDisposition ? { contentDisposition } : {}),
      metadata: {
        pipeline: "social_attachment_derivatives_v1",
        sourcePath: sourcePath(source),
        attachmentId: source.attachmentId,
        uid: source.uid,
        size,
      },
    },
  });

  const [storedMetadata] = await bucket.file(outputPath).getMetadata();
  return {
    storagePath: outputPath,
    width: info.width,
    height: info.height,
    mimeType: readNonEmptyString(storedMetadata.contentType) || "image/webp",
    sizeBytes: Number(storedMetadata.size ?? data.length),
  };
}

async function readImageRenditionMetadata(params: {
  bucket: ReturnType<ReturnType<typeof admin.storage>["bucket"]>;
  path: string;
  size: RenditionSize;
}): Promise<MediaRenditionMetadata> {
  const file = params.bucket.file(params.path);
  const [[metadata], [bytes]] = await Promise.all([
    file.getMetadata(),
    file.download(),
  ]);
  const { info } = await sharp(bytes, { failOn: "none" })
    .rotate()
    .toBuffer({ resolveWithObject: true });

  return {
    storagePath: params.path,
    width: info.width,
    height: info.height,
    mimeType: readNonEmptyString(metadata.contentType) || "application/octet-stream",
    sizeBytes: Number(metadata.size ?? bytes.length),
  };
}

async function markProcessing(source: AttachmentSourcePath): Promise<void> {
  await admin.firestore().collection("attachments").doc(source.attachmentId).set(
    {
      id: source.attachmentId,
      processingStatus: "processing",
      updatedAt: FieldValue.serverTimestamp(),
      metadata: {
        attachmentId: source.attachmentId,
        uploader: { uid: source.uid },
        processingStatus: "processing",
      },
    },
    { merge: true }
  );
}

async function markFailed(source: AttachmentSourcePath, error: unknown): Promise<void> {
  await admin.firestore().collection("attachments").doc(source.attachmentId).set(
    {
      id: source.attachmentId,
      processingStatus: "failed",
      processingError: String(error),
      updatedAt: FieldValue.serverTimestamp(),
      metadata: {
        attachmentId: source.attachmentId,
        uploader: { uid: source.uid },
        processingStatus: "failed",
      },
    },
    { merge: true }
  );
}

async function markReady(params: {
  source: AttachmentSourcePath;
  renditions: Record<RenditionSize, MediaRenditionMetadata>;
}): Promise<void> {
  const { renditions, source } = params;
  const original = renditions.original;
  await admin.firestore().collection("attachments").doc(source.attachmentId).set(
    {
      id: source.attachmentId,
      width: original.width,
      height: original.height,
      aspectRatio: aspectRatio(original.width, original.height),
      processingStatus: "ready",
      renditions,
      updatedAt: FieldValue.serverTimestamp(),
      metadata: {
        attachmentId: source.attachmentId,
        uploader: { uid: source.uid },
        storagePath: original.storagePath,
        width: original.width,
        height: original.height,
        aspectRatio: aspectRatio(original.width, original.height),
        dimensions: {
          width: original.width,
          height: original.height,
        },
        processingStatus: "ready",
        renditions,
      },
    },
    { merge: true }
  );
}

export const processAttachmentImageDerivatives = onObjectFinalized(
  {
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const object = event.data;
    const path = readNonEmptyString(object.name);
    const contentType = readNonEmptyString(object.contentType).toLowerCase();

    const source = parseAttachmentSourcePath(path);
    if (!source) return;
    if (!contentType.startsWith("image/")) return;

    const bucket = admin.storage().bucket(object.bucket);
    const originalFile = bucket.file(path);

    const derivativePaths = (Object.keys(DERIVATIVE_CONFIGS) as DerivativeSize[]).map(
      (size) => derivativePath(source, size)
    );
    const existing = await Promise.all(
      derivativePaths.map((derivative) => storageFileExists(bucket, derivative))
    );
    if (existing.every(Boolean)) {
      logger.info("[ATTACHMENT_DERIVATIVES][REUSE_READY_FILES]", {
        attachmentId: source.attachmentId,
        path,
      });
    }

    logger.info("[ATTACHMENT_DERIVATIVES][START]", {
      attachmentId: source.attachmentId,
      path,
      contentType,
    });

    await markProcessing(source);

    try {
      const [originalBytes] = await originalFile.download();
      const contentDisposition =
        typeof object.contentDisposition === "string" ? object.contentDisposition : undefined;

      const [original, thumb, feed, large] = await Promise.all([
        readImageRenditionMetadata({ bucket, path: sourcePath(source), size: "original" }),
        saveDerivative({
          bucket,
          source,
          size: "thumb",
          originalBytes,
          contentDisposition,
        }),
        saveDerivative({
          bucket,
          source,
          size: "feed",
          originalBytes,
          contentDisposition,
        }),
        saveDerivative({
          bucket,
          source,
          size: "large",
          originalBytes,
          contentDisposition,
        }),
      ]);

      const renditions = { original, thumb, feed, large };
      await markReady({ source, renditions });

      logger.info("[ATTACHMENT_DERIVATIVES][READY]", {
        attachmentId: source.attachmentId,
        originalPath: path,
        derivatives: [thumb.storagePath, feed.storagePath, large.storagePath],
      });
    } catch (error) {
      await markFailed(source, error);
      logger.error("[ATTACHMENT_DERIVATIVES][FAILED]", {
        attachmentId: source.attachmentId,
        path,
        error: String(error),
      });
      throw error;
    }
  }
);
