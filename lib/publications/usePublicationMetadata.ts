import { useEffect } from "react";
import { buildPublicationSlugPath } from "./publicationUrl.ts";

type PublicationMetadataInput = {
  publicationId: string;
  title?: string;
  author?: string;
  excerpt?: string;
  coverUrl?: string;
  canonicalSlug?: string;
  datePublished?: string;
  dateModified?: string;
  normalizedContent?: {
    units: Array<{
      content: Array<Record<string, unknown>>;
    }>;
  };
};

type LongformNode = {
  type?: string;
  text?: string;
  content?: LongformNode[];
};

const DEFAULT_TITLE = "BookTown Publication";
const DEFAULT_IMAGE_PATH = "/icons/publication-social-fallback.png";
const TAG_MARKER = "data-booktown-publication-meta";

function extractNodeText(node: LongformNode): string {
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = Array.isArray(node.content)
    ? node.content.map((child) => extractNodeText(child)).join(" ")
    : "";
  return `${ownText} ${childText}`.replace(/\s+/g, " ").trim();
}

function extractFirstCleanParagraph(
  normalizedContent?: PublicationMetadataInput["normalizedContent"]
): string {
  if (!normalizedContent?.units?.length) return "";

  for (const unit of normalizedContent.units) {
    for (const rawBlock of unit.content) {
      const block = rawBlock as LongformNode;
      if (block?.type !== "paragraph") continue;
      const text = extractNodeText(block);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function truncateCleanly(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;

  const slice = normalized.slice(0, limit + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cropped = (lastSpace >= Math.floor(limit * 0.65)
    ? slice.slice(0, lastSpace)
    : slice.slice(0, limit)
  ).trim();

  return cropped.replace(/[.,;:!?-]+$/g, "").trim();
}

function deriveDescription(input: PublicationMetadataInput): string {
  const excerpt = typeof input.excerpt === "string" ? input.excerpt.trim() : "";
  const bodySnippet = extractFirstCleanParagraph(input.normalizedContent);
  const chosen = excerpt || bodySnippet || input.title || DEFAULT_TITLE;
  return truncateCleanly(chosen, 160);
}

function toAbsoluteUrl(candidate: string): string {
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }

  if (typeof window === "undefined") {
    return candidate;
  }

  return new URL(candidate, window.location.origin).toString();
}

function upsertMetaTag(
  root: HTMLHeadElement,
  attrName: "name" | "property",
  attrValue: string,
  content: string
) {
  const selector = `meta[${attrName}="${attrValue}"][${TAG_MARKER}="true"]`;
  const existing = root.querySelector(selector) as HTMLMetaElement | null;
  const tag = existing ?? document.createElement("meta");
  tag.setAttribute(attrName, attrValue);
  tag.setAttribute("content", content);
  tag.setAttribute(TAG_MARKER, "true");
  if (!existing) {
    root.appendChild(tag);
  }
}

function upsertCanonicalLink(root: HTMLHeadElement, href: string) {
  const existing = root.querySelector(
    `link[rel="canonical"][${TAG_MARKER}="true"]`
  ) as HTMLLinkElement | null;
  const link = existing ?? document.createElement("link");
  link.setAttribute("rel", "canonical");
  link.setAttribute("href", href);
  link.setAttribute(TAG_MARKER, "true");
  if (!existing) {
    root.appendChild(link);
  }
}

function upsertJsonLdScript(root: HTMLHeadElement, payload: Record<string, unknown>) {
  const existing = root.querySelector(
    `script[type="application/ld+json"][${TAG_MARKER}="true"]`
  ) as HTMLScriptElement | null;
  const script = existing ?? document.createElement("script");
  script.setAttribute("type", "application/ld+json");
  script.setAttribute(TAG_MARKER, "true");
  script.textContent = JSON.stringify(payload);
  if (!existing) {
    root.appendChild(script);
  }
}

export function usePublicationMetadata(input: PublicationMetadataInput | null) {
  useEffect(() => {
    if (!input || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const head = document.head;
    const previousTitle = document.title;
    const previousManagedTags = Array.from(
      head.querySelectorAll(`[${TAG_MARKER}="true"]`)
    );
    previousManagedTags.forEach((node) => node.remove());

    const title = (input.title || "").trim() || DEFAULT_TITLE;
    const seoDescription = deriveDescription(input);
    const canonicalUrl = toAbsoluteUrl(
      buildPublicationSlugPath(title, input.publicationId, input.canonicalSlug)
    );
    const imageUrl = toAbsoluteUrl(input.coverUrl?.trim() || DEFAULT_IMAGE_PATH);
    const authorName = input.author?.trim() || "BookTown";
    const jsonLdPayload: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description: seoDescription,
      image: imageUrl,
      author: {
        "@type": "Person",
        name: authorName,
      },
      publisher: {
        "@type": "Organization",
        name: "BookTown",
      },
      mainEntityOfPage: canonicalUrl,
    };

    if (typeof input.datePublished === "string" && input.datePublished.trim()) {
      jsonLdPayload.datePublished = input.datePublished.trim();
    }

    if (typeof input.dateModified === "string" && input.dateModified.trim()) {
      jsonLdPayload.dateModified = input.dateModified.trim();
    }

    document.title = `${title} | BookTown`;
    upsertCanonicalLink(head, canonicalUrl);
    upsertMetaTag(head, "name", "description", seoDescription);
    upsertMetaTag(head, "name", "author", authorName);
    upsertMetaTag(head, "property", "og:type", "article");
    upsertMetaTag(head, "property", "og:site_name", "BookTown");
    upsertMetaTag(head, "property", "og:url", canonicalUrl);
    upsertMetaTag(head, "property", "og:title", title);
    upsertMetaTag(head, "property", "og:description", seoDescription);
    upsertMetaTag(head, "property", "og:image", imageUrl);
    upsertMetaTag(head, "name", "twitter:card", "summary_large_image");
    upsertMetaTag(head, "name", "twitter:title", title);
    upsertMetaTag(head, "name", "twitter:description", seoDescription);
    upsertMetaTag(head, "name", "twitter:image", imageUrl);
    upsertJsonLdScript(head, jsonLdPayload);

    return () => {
      Array.from(head.querySelectorAll(`[${TAG_MARKER}="true"]`)).forEach((node) =>
        node.remove()
      );
      document.title = previousTitle;
    };
  }, [
    input?.author,
    input?.canonicalSlug,
    input?.coverUrl,
    input?.dateModified,
    input?.datePublished,
    input?.excerpt,
    input?.normalizedContent,
    input?.publicationId,
    input?.title,
  ]);
}
