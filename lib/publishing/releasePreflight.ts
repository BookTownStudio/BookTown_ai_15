import type { WriteContentDoc, WriteContentNode } from "../../types/entities.ts";

type ReleasePreflightResult =
  | { ok: true }
  | {
      ok: false;
      chapterNumber?: number;
      nodeIndex?: number;
      message: string;
    };

function isHeadingNode(node: WriteContentNode | undefined): boolean {
  return !!node && node.type === "heading";
}

export function validateReleasePreflight(
  contentDoc?: WriteContentDoc
): ReleasePreflightResult {
  if (!contentDoc || contentDoc.type !== "doc" || !Array.isArray(contentDoc.content)) {
    return {
      ok: false,
      message:
        "This manuscript is missing structured editor content and cannot be prepared for release.",
    };
  }

  let chapterBoundaryCount = 0;

  for (let index = 0; index < contentDoc.content.length; index += 1) {
    const node = contentDoc.content[index];
    if (node.type !== "horizontalRule") {
      continue;
    }

    chapterBoundaryCount += 1;
    const nextNode = contentDoc.content[index + 1];

    if (!isHeadingNode(nextNode)) {
      return {
        ok: false,
        chapterNumber: chapterBoundaryCount,
        nodeIndex: index,
        message: `Chapter ${chapterBoundaryCount} is missing a heading immediately after its separator.`,
      };
    }
  }

  return { ok: true };
}
