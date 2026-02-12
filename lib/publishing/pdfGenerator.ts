
import { jsPDF } from "jspdf";
import { BookContent } from './contentParser.ts';

// Helper to read blob as base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

export const generatePdfBlob = async (book: BookContent, coverBlob?: Blob): Promise<Blob> => {
    // A5 size is common for books
    const doc = new jsPDF({ format: 'a5', unit: 'pt' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const textWidth = pageWidth - (margin * 2);

    // --- Cover Page (if exists) ---
    if (coverBlob) {
        try {
            const coverBase64 = await blobToBase64(coverBlob);
            // Full page cover
            doc.addImage(coverBase64, 'JPEG', 0, 0, pageWidth, pageHeight);
            doc.addPage();
        } catch (e) {
            console.error("Failed to add cover to PDF", e);
        }
    }

    // --- Title Page ---
    doc.setFont("times", "bold");
    doc.setFontSize(24);
    doc.text(book.title, pageWidth / 2, pageHeight / 3, { align: 'center', maxWidth: textWidth });
    
    doc.setFont("times", "normal");
    doc.setFontSize(14);
    doc.text(`by ${book.author}`, pageWidth / 2, pageHeight / 2, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text("Published via BookTown", pageWidth / 2, pageHeight - margin, { align: 'center' });

    // --- Chapters ---
    doc.addPage();

    book.chapters.forEach((chapter, index) => {
        if (index > 0) doc.addPage();

        // Chapter Title
        doc.setFont("times", "bold");
        doc.setFontSize(18);
        doc.text(chapter.title, pageWidth / 2, margin * 2, { align: 'center' });

        // Content
        doc.setFont("times", "normal");
        doc.setFontSize(11);
        
        // Strip HTML tags for PDF text (Naive approach for client-side demo)
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = chapter.content;
        const plainText = tempDiv.innerText || tempDiv.textContent || "";
        
        // Split text into lines
        const lines = doc.splitTextToSize(plainText, textWidth);
        
        let cursorY = margin * 3.5;
        const lineHeight = 14;

        lines.forEach((line: string) => {
            if (cursorY + lineHeight > pageHeight - margin) {
                doc.addPage();
                cursorY = margin;
            }
            doc.text(line, margin, cursorY);
            cursorY += lineHeight;
        });
    });

    return doc.output('blob');
};
