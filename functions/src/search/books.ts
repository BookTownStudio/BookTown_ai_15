import { Request, Response } from "express";
import * as logger from "firebase-functions/logger";

// Define the strict contract expected by the frontend
interface Book {
    id: string;
    authorId: string;
    titleEn: string;
    titleAr: string;
    authorEn: string;
    authorAr: string;
    coverUrl: string;
    descriptionEn: string;
    descriptionAr: string;
    genresEn: string[];
    genresAr: string[];
    rating: number;
    ratingsCount: number;
    isEbookAvailable: boolean;
    publicationDate?: string;
    pageCount?: number;
}

const GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes";
const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const MAX_RESULTS = 10;

// FIX: Cast req and res to any to avoid property existence errors (method, status, body, query, set).
export const searchBooksHandler = async (req: any, res: any) => {
    /**
     * 🔒 METHOD TOLERANCE (PRODUCTION-GRADE)
     * Accept both GET and POST.
     * Search is idempotent and safe.
     */
    if (req.method !== "GET" && req.method !== "POST") {
        res.status(200).json([]);
        return;
    }

    /**
     * 🔑 METHOD-SAFE QUERY EXTRACTION
     */
    const query =
        (req.method === "POST"
            ? req.body?.q
            : req.query.q) as string;

    if (!query || query.trim().length < 2) {
        // Always return strict empty array
        res.status(200).json([]);
        return;
    }

    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    let books: Book[] = [];
    const sanitizedQuery = encodeURIComponent(query.trim());

    try {
        /**
         * 1. Google Books Search (Primary)
         */
        if (apiKey) {
            try {
                const googleUrl = `${GOOGLE_BOOKS_API_URL}?q=${sanitizedQuery}&maxResults=${MAX_RESULTS}&key=${apiKey}`;
                const response = await fetch(googleUrl);

                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data?.items)) {
                        books = data.items
                            .map((item: any) => normalizeGoogleBook(item))
                            .filter((b: Book | null): b is Book => b !== null);
                    }
                } else {
                    logger.warn(
                        `Google Books API failed: ${response.status} ${response.statusText}`
                    );
                }
            } catch (error) {
                logger.error("Error fetching from Google Books", error);
            }
        } else {
            logger.warn(
                "GOOGLE_BOOKS_API_KEY not configured. Skipping Google Books search."
            );
        }

        /**
         * 2. Open Library Fallback
         */
        if (books.length === 0) {
            logger.info("Falling back to Open Library search");
            try {
                const openLibUrl = `${OPEN_LIBRARY_SEARCH_URL}?q=${sanitizedQuery}&limit=${MAX_RESULTS}`;
                const response = await fetch(openLibUrl);

                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data?.docs)) {
                        books = data.docs
                            .map((doc: any) => normalizeOpenLibraryBook(doc))
                            .filter((b: Book | null): b is Book => b !== null);
                    }
                }
            } catch (error) {
                logger.error("Error fetching from Open Library", error);
            }
        }

        /**
         * 3. Deterministic JSON Response
         */
        res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
        res.status(200).json(books);

    } catch (error: any) {
        /**
         * 🔒 GLOBAL SAFETY NET
         * Never leak errors to frontend
         */
        logger.error("Critical Search Handler Error", error);
        res.status(200).json([]);
    }
};

// ---------------- NORMALIZATION ----------------

function normalizeGoogleBook(item: any): Book | null {
    if (!item || !item.id || !item.volumeInfo) return null;

    const info = item.volumeInfo;
    if (!info.title) return null;

    return {
        id: `gb_${item.id}`,
        authorId: "external_author",
        titleEn: info.title,
        titleAr: info.title,
        authorEn: Array.isArray(info.authors)
            ? info.authors.join(", ")
            : "Unknown Author",
        authorAr: Array.isArray(info.authors)
            ? info.authors.join(", ")
            : "غير معروف",
        coverUrl: info.imageLinks?.thumbnail?.replace("http:", "https:") || "",
        descriptionEn: info.description || "No description available.",
        descriptionAr: info.description || "لا يوجد وصف متاح.",
        genresEn: Array.isArray(info.categories) ? info.categories : [],
        genresAr: [],
        rating: typeof info.averageRating === "number" ? info.averageRating : 0,
        ratingsCount:
            typeof info.ratingsCount === "number" ? info.ratingsCount : 0,
        isEbookAvailable: false,
        pageCount:
            typeof info.pageCount === "number" ? info.pageCount : 0,
        publicationDate: info.publishedDate || "",
    };
}

function normalizeOpenLibraryBook(doc: any): Book | null {
    if (!doc || !doc.key || !doc.title) return null;

    const coverId = doc.cover_i;
    const coverUrl = coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : "";

    const rawId = doc.key.replace("/works/", "");

    return {
        id: `ol_${rawId}`,
        authorId: "external_author",
        titleEn: doc.title,
        titleAr: doc.title,
        authorEn: Array.isArray(doc.author_name)
            ? doc.author_name.join(", ")
            : "Unknown Author",
        authorAr: Array.isArray(doc.author_name)
            ? doc.author_name.join(", ")
            : "غير معروف",
        coverUrl,
        descriptionEn: "Imported from Open Library.",
        descriptionAr: "تم الاستيراد من المكتبة المفتوحة.",
        genresEn: [],
        genresAr: [],
        rating: 0,
        ratingsCount: 0,
        isEbookAvailable: false,
        pageCount:
            typeof doc.number_of_pages_median === "number"
                ? doc.number_of_pages_median
                : 0,
        publicationDate: doc.first_publish_year
            ? doc.first_publish_year.toString()
            : "",
    };
}