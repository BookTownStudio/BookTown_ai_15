import JSZip from "jszip";
import type {
  NormalizedBlockNode,
  NormalizedManuscript,
} from "./normalizeProjectManuscript";

type CoverAsset = {
  bytes: Buffer;
  mediaType: "image/jpeg" | "image/png";
  fileName: "cover.jpg" | "cover.png";
};

type EpubMetadata = {
  title: string;
  author: string;
  language: string;
  identifier: string;
};

const CSS_CONTENT = `
body {
  font-family: serif;
  line-height: 1.6;
  margin: 5%;
}
h1 {
  text-align: center;
  margin: 0 0 2rem;
}
h2, h3 {
  margin: 1.6rem 0 0.8rem;
}
p {
  margin: 0 0 1rem;
}
blockquote {
  margin: 1rem 0;
  padding-inline-start: 1rem;
  border-inline-start: 3px solid #c8c1b5;
}
ul, ol {
  margin: 0 0 1rem 1.5rem;
}
li {
  margin: 0.35rem 0;
}
`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderCommonAttrs(node: NormalizedBlockNode): string {
  const attrs: string[] = [];
  if (node.attrs?.lang) {
    attrs.push(`lang="${escapeXml(node.attrs.lang)}"`);
  }
  if (node.attrs?.dir) {
    attrs.push(`dir="${escapeXml(node.attrs.dir)}"`);
  }
  return attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
}

function renderTextNode(node: NormalizedBlockNode): string {
  let text = escapeXml(node.text ?? "");
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") {
      text = `<strong>${text}</strong>`;
    } else if (mark.type === "italic") {
      text = `<em>${text}</em>`;
    } else if (mark.type === "underline") {
      text = `<u>${text}</u>`;
    }
  }
  return text;
}

function renderInlineNodes(nodes: NormalizedBlockNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return renderTextNode(node);
      }
      if (Array.isArray(node.content)) {
        return renderInlineNodes(node.content);
      }
      return "";
    })
    .join("");
}

function renderBlockNode(node: NormalizedBlockNode): string {
  if (node.type === "text") {
    return renderTextNode(node);
  }

  if (node.type === "paragraph") {
    return `<p${renderCommonAttrs(node)}>${renderInlineNodes(
      node.content ?? []
    )}</p>`;
  }

  if (node.type === "heading") {
    const level = node.attrs?.level === 3 ? 3 : 2;
    return `<h${level}${renderCommonAttrs(node)}>${renderInlineNodes(
      node.content ?? []
    )}</h${level}>`;
  }

  if (node.type === "blockquote") {
    return `<blockquote${renderCommonAttrs(node)}>${renderBlockNodes(
      node.content ?? []
    )}</blockquote>`;
  }

  if (node.type === "bulletList") {
    return `<ul${renderCommonAttrs(node)}>${renderBlockNodes(
      node.content ?? []
    )}</ul>`;
  }

  if (node.type === "orderedList") {
    return `<ol${renderCommonAttrs(node)}>${renderBlockNodes(
      node.content ?? []
    )}</ol>`;
  }

  if (node.type === "listItem") {
    const hasBlockChildren = (node.content ?? []).some(
      (child) => child.type !== "text"
    );
    const inner = hasBlockChildren
      ? renderBlockNodes(node.content ?? [])
      : renderInlineNodes(node.content ?? []);
    return `<li${renderCommonAttrs(node)}>${inner}</li>`;
  }

  return "";
}

function renderBlockNodes(nodes: NormalizedBlockNode[]): string {
  return nodes.map((node) => renderBlockNode(node)).join("\n");
}

function createContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function createCoverHtml(fileName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Cover</title>
</head>
<body>
  <img src="../Images/${escapeXml(fileName)}" alt="Cover Image" />
</body>
</html>`;
}

function createUnitHtml(params: {
  title: string;
  contentHtml: string;
  language: string;
}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(
    params.language
  )}">
<head>
  <title>${escapeXml(params.title)}</title>
  <link href="../Styles/style.css" type="text/css" rel="stylesheet"/>
</head>
<body>
  <h1>${escapeXml(params.title)}</h1>
  ${params.contentHtml}
</body>
</html>`;
}

function createOpf(params: {
  metadata: EpubMetadata;
  unitCount: number;
  cover?: CoverAsset;
}): string {
  let manifestItems = "";
  let spineRefs = "";

  if (params.cover) {
    manifestItems += `<item id="cover" href="Images/${params.cover.fileName}" media-type="${params.cover.mediaType}" />\n`;
    manifestItems += `<item id="cover-page" href="Text/cover.xhtml" media-type="application/xhtml+xml" />\n`;
    spineRefs += `<itemref idref="cover-page" />\n`;
  }

  for (let index = 0; index < params.unitCount; index += 1) {
    manifestItems += `<item id="unit_${index}" href="Text/unit_${index}.xhtml" media-type="application/xhtml+xml" />\n`;
    spineRefs += `<itemref idref="unit_${index}" />\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(params.metadata.title)}</dc:title>
    <dc:creator opf:role="aut">${escapeXml(params.metadata.author)}</dc:creator>
    <dc:language>${escapeXml(params.metadata.language)}</dc:language>
    <dc:identifier id="BookId">${escapeXml(params.metadata.identifier)}</dc:identifier>
    ${params.cover ? '<meta name="cover" content="cover"/>' : ""}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="style" href="Styles/style.css" media-type="text/css" />
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineRefs}
  </spine>
</package>`;
}

function createNcx(params: {
  metadata: EpubMetadata;
  titles: string[];
}): string {
  const navPoints = params.titles
    .map(
      (title, index) => `
    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(title)}</text></navLabel>
      <content src="Text/unit_${index}.xhtml"/>
    </navPoint>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(params.metadata.identifier)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(params.metadata.title)}</text></docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`;
}

export async function generateReleaseEpub(params: {
  normalizedContent: NormalizedManuscript;
  metadata: EpubMetadata;
  cover?: CoverAsset;
}): Promise<Buffer> {
  if (!Array.isArray(params.normalizedContent.units) || params.normalizedContent.units.length === 0) {
    throw new Error("Normalized manuscript must contain at least one unit.");
  }

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", createContainerXml());

  const oebps = zip.folder("OEBPS");
  if (!oebps) {
    throw new Error("Failed to initialize EPUB package.");
  }

  oebps.file(
    "content.opf",
    createOpf({
      metadata: params.metadata,
      unitCount: params.normalizedContent.units.length,
      cover: params.cover,
    })
  );
  oebps.file(
    "toc.ncx",
    createNcx({
      metadata: params.metadata,
      titles: params.normalizedContent.units.map((unit) => unit.title),
    })
  );

  const styles = oebps.folder("Styles");
  styles?.file("style.css", CSS_CONTENT);

  const textFolder = oebps.folder("Text");
  if (!textFolder) {
    throw new Error("Failed to initialize EPUB text folder.");
  }

  params.normalizedContent.units.forEach((unit, index) => {
    textFolder.file(
      `unit_${index}.xhtml`,
      createUnitHtml({
        title: unit.title,
        contentHtml: renderBlockNodes(unit.content),
        language: params.metadata.language,
      })
    );
  });

  if (params.cover) {
    const imagesFolder = oebps.folder("Images");
    imagesFolder?.file(params.cover.fileName, params.cover.bytes);
    textFolder.file("cover.xhtml", createCoverHtml(params.cover.fileName));
  }

  return zip.generateAsync({
    type: "nodebuffer",
    mimeType: "application/epub+zip",
  });
}
