
import JSZip from 'jszip';
import { BookContent } from './contentParser.ts';

const createContainerXml = () => `<?xml version="1.0" encoding="UTF-8" ?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const createOpf = (book: BookContent, uid: string, hasCover: boolean) => {
    let manifestItems = '';
    let spineRefs = '';

    if (hasCover) {
        manifestItems += `<item id="cover" href="Images/cover.jpg" media-type="image/jpeg" />\n`;
        manifestItems += `<item id="cover-page" href="Text/cover.xhtml" media-type="application/xhtml+xml" />\n`;
        spineRefs += `<itemref idref="cover-page" />\n`;
    }

    book.chapters.forEach((_, index) => {
        manifestItems += `<item id="chapter_${index}" href="Text/chapter_${index}.xhtml" media-type="application/xhtml+xml" />\n`;
        spineRefs += `<itemref idref="chapter_${index}" />\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
        <dc:title>${book.title}</dc:title>
        <dc:creator opf:role="aut">${book.author}</dc:creator>
        <dc:language>en</dc:language>
        <dc:identifier id="BookId">urn:uuid:${uid}</dc:identifier>
        ${hasCover ? '<meta name="cover" content="cover"/>' : ''}
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
};

const createNcx = (book: BookContent, uid: string) => {
    let navPoints = '';
    book.chapters.forEach((chapter, index) => {
        navPoints += `
        <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
            <navLabel><text>${chapter.title}</text></navLabel>
            <content src="Text/chapter_${index}.xhtml"/>
        </navPoint>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="urn:uuid:${uid}"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle><text>${book.title}</text></docTitle>
    <navMap>
        ${navPoints}
    </navMap>
</ncx>`;
};

const createChapterHtml = (title: string, content: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${title}</title>
  <link href="../Styles/style.css" type="text/css" rel="stylesheet"/>
</head>
<body>
  <h1>${title}</h1>
  ${content}
</body>
</html>`;

const createCoverHtml = () => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Cover</title>
  <style type="text/css">
    body { margin: 0; padding: 0; text-align: center; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <img src="../Images/cover.jpg" alt="Cover Image" />
</body>
</html>`;

const CSS_CONTENT = `body { font-family: serif; line-height: 1.5; margin: 5%; } h1 { text-align: center; margin-bottom: 2em; } p { margin-bottom: 1em; text-indent: 1em; }`;

export const generateEpubBlob = async (book: BookContent, uid: string, coverBlob?: Blob): Promise<Blob> => {
    const zip = new JSZip();

    // 1. Mimetype (must be first, uncompressed)
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // 2. META-INF
    zip.file("META-INF/container.xml", createContainerXml());

    // 3. OEBPS
    const oebps = zip.folder("OEBPS");
    if (!oebps) throw new Error("Failed to create zip folder");

    const hasCover = !!coverBlob;

    oebps.file("content.opf", createOpf(book, uid, hasCover));
    oebps.file("toc.ncx", createNcx(book, uid));
    
    // Styles
    const styles = oebps.folder("Styles");
    if(styles) styles.file("style.css", CSS_CONTENT);

    // Text
    const textFolder = oebps.folder("Text");
    if (!textFolder) throw new Error("Failed to create text folder");

    book.chapters.forEach((chapter, index) => {
        textFolder.file(`chapter_${index}.xhtml`, createChapterHtml(chapter.title, chapter.content));
    });

    // Images
    if (hasCover && coverBlob) {
        const imagesFolder = oebps.folder("Images");
        if (imagesFolder) {
            imagesFolder.file("cover.jpg", coverBlob);
        }
        textFolder.file("cover.xhtml", createCoverHtml());
    }

    return await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
};
