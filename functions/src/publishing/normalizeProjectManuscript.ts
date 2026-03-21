import { HttpsError } from "firebase-functions/v2/https";

type SupportedNodeType =
  | "paragraph"
  | "heading"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "listItem"
  | "horizontalRule"
  | "text";

type SupportedMarkType = "bold" | "italic" | "underline";
type WriteDirection = "ltr" | "rtl";

export type NormalizedBlockNode = {
  type: Exclude<SupportedNodeType, "horizontalRule">;
  attrs?: {
    level?: 1 | 2 | 3;
    lang?: string;
    dir?: WriteDirection;
    langManual?: boolean;
  };
  text?: string;
  marks?: Array<{ type: SupportedMarkType }>;
  content?: NormalizedBlockNode[];
};

export type NormalizedManuscriptUnit = {
  index: number;
  title: string;
  type: "chapter" | "section";
  content: NormalizedBlockNode[];
};

export type NormalizedManuscript = {
  units: NormalizedManuscriptUnit[];
};

type MutableUnit = {
  title: string;
  type: "chapter" | "section";
  content: NormalizedBlockNode[];
  hasMeaningfulContent: boolean;
};

const SUPPORTED_NODE_TYPES = new Set<SupportedNodeType>([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
  "text",
]);

const SUPPORTED_MARK_TYPES = new Set<SupportedMarkType>([
  "bold",
  "italic",
  "underline",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNodeType(value: unknown): SupportedNodeType | null {
  if (typeof value !== "string") return null;
  return SUPPORTED_NODE_TYPES.has(value as SupportedNodeType)
    ? (value as SupportedNodeType)
    : null;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, 20_000);
}

function sanitizeMarks(value: unknown): Array<{ type: SupportedMarkType }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks = value
    .map((entry) => {
      const record = asRecord(entry);
      const type =
        typeof record?.type === "string" &&
        SUPPORTED_MARK_TYPES.has(record.type as SupportedMarkType)
          ? (record.type as SupportedMarkType)
          : null;
      return type ? { type } : null;
    })
    .filter((entry): entry is { type: SupportedMarkType } => entry !== null)
    .slice(0, 8);

  return marks.length > 0 ? marks : undefined;
}

function sanitizeAttrs(
  value: unknown
): NormalizedBlockNode["attrs"] | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const attrs: NonNullable<NormalizedBlockNode["attrs"]> = {};

  if (
    typeof record.level === "number" &&
    Number.isInteger(record.level) &&
    record.level >= 1 &&
    record.level <= 3
  ) {
    attrs.level = record.level as 1 | 2 | 3;
  }

  if (typeof record.lang === "string") {
    const lang = record.lang.trim().slice(0, 12);
    if (lang.length >= 2) {
      attrs.lang = lang;
    }
  }

  if (record.dir === "ltr" || record.dir === "rtl") {
    attrs.dir = record.dir;
  }

  if (typeof record.langManual === "boolean") {
    attrs.langManual = record.langManual;
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function sanitizeNode(value: unknown): NormalizedBlockNode | null {
  const record = asRecord(value);
  if (!record) return null;

  const type = asNodeType(record.type);
  if (!type || type === "horizontalRule") {
    return null;
  }

  const content = Array.isArray(record.content)
    ? record.content
        .map((entry) => sanitizeNode(entry))
        .filter((entry): entry is NormalizedBlockNode => entry !== null)
        .slice(0, 2000)
    : undefined;

  const sanitized: NormalizedBlockNode = {
    type,
  };

  const attrs = sanitizeAttrs(record.attrs);
  if (attrs) {
    sanitized.attrs = attrs;
  }

  const text = sanitizeText(record.text);
  if (typeof text === "string") {
    sanitized.text = text;
  }

  const marks = sanitizeMarks(record.marks);
  if (marks) {
    sanitized.marks = marks;
  }

  if (content && content.length > 0) {
    sanitized.content = content;
  }

  return sanitized;
}

function extractNodeText(node: NormalizedBlockNode): string {
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = Array.isArray(node.content)
    ? node.content.map((entry) => extractNodeText(entry)).join(" ")
    : "";
  return collapseWhitespace(`${ownText} ${childText}`);
}

function hasMeaningfulText(node: NormalizedBlockNode): boolean {
  return extractNodeText(node).length > 0;
}

function makeUnit(
  title: string,
  type: "chapter" | "section"
): MutableUnit {
  return {
    title,
    type,
    content: [],
    hasMeaningfulContent: false,
  };
}

function assertValidContentDoc(contentDoc: unknown): Record<string, unknown> {
  const doc = asRecord(contentDoc);
  if (
    !doc ||
    doc.type !== "doc" ||
    doc.version !== 1 ||
    !Array.isArray(doc.content)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Project contentDoc is missing or invalid."
    );
  }

  return doc;
}

function normalizeTitle(text: string, context: string): string {
  const normalized = collapseWhitespace(text);
  if (!normalized) {
    throw new HttpsError(
      "failed-precondition",
      `${context} is missing a valid heading title.`
    );
  }
  return normalized.slice(0, 240);
}

export function normalizeProjectManuscript(params: {
  contentDoc: unknown;
  projectTitle: string;
}): NormalizedManuscript {
  const doc = assertValidContentDoc(params.contentDoc);
  const content = doc.content as unknown[];
  const hasSeparator = content.some((entry) => {
    const record = asRecord(entry);
    return record?.type === "horizontalRule";
  });

  const fallbackTitle = collapseWhitespace(params.projectTitle) || "Untitled";
  const units: MutableUnit[] = [];
  let currentUnit: MutableUnit | null = null;
  let pendingBoundary = false;
  let hasAnyMeaningfulContent = false;

  const finalizeCurrentUnit = () => {
    if (!currentUnit) return;
    units.push(currentUnit);
    currentUnit = null;
  };

  const appendToCurrentUnit = (node: NormalizedBlockNode) => {
    if (!currentUnit) {
      currentUnit = makeUnit(fallbackTitle, "section");
    }
    currentUnit.content.push(node);
    if (hasMeaningfulText(node)) {
      currentUnit.hasMeaningfulContent = true;
      hasAnyMeaningfulContent = true;
    }
  };

  for (const entry of content) {
    const rawNode = asRecord(entry);
    if (!rawNode) {
      continue;
    }

    const rawType = asNodeType(rawNode.type);
    if (!rawType) {
      continue;
    }

    if (rawType === "horizontalRule") {
      if (!hasSeparator) {
        continue;
      }
      if (pendingBoundary) {
        throw new HttpsError(
          "failed-precondition",
          "Each structural separator must be followed by a heading before the next separator."
        );
      }
      finalizeCurrentUnit();
      pendingBoundary = true;
      continue;
    }

    const sanitizedNode = sanitizeNode(rawNode);
    if (!sanitizedNode) {
      continue;
    }

    if (hasSeparator) {
      if (pendingBoundary) {
        if (sanitizedNode.type !== "heading") {
          if (!hasMeaningfulText(sanitizedNode)) {
            continue;
          }
          throw new HttpsError(
            "failed-precondition",
            "Each structural separator must be followed by a heading before manuscript content."
          );
        }

        currentUnit = makeUnit(
          normalizeTitle(
            extractNodeText(sanitizedNode),
            "A chapter boundary"
          ),
          "chapter"
        );
        pendingBoundary = false;
        continue;
      }

      if (!currentUnit && sanitizedNode.type === "heading") {
        currentUnit = makeUnit(
          normalizeTitle(extractNodeText(sanitizedNode), "A section"),
          "section"
        );
        continue;
      }

      appendToCurrentUnit(sanitizedNode);
      continue;
    }

    if (sanitizedNode.type === "heading") {
      finalizeCurrentUnit();
      currentUnit = makeUnit(
        normalizeTitle(extractNodeText(sanitizedNode), "A section"),
        "section"
      );
      continue;
    }

    appendToCurrentUnit(sanitizedNode);
  }

  if (pendingBoundary) {
    throw new HttpsError(
      "failed-precondition",
      "A structural separator is missing its heading title."
    );
  }

  finalizeCurrentUnit();

  if (!hasAnyMeaningfulContent || units.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Project contentDoc does not contain publishable manuscript content."
    );
  }

  return {
    units: units.map((unit, index) => ({
      index: index + 1,
      title: unit.title,
      type: unit.type,
      content: unit.content,
    })),
  };
}
