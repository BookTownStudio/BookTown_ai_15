import { LibrarySearchDataService } from './db.types.ts';
import {
    BookEdition,
    BibliographicWork,
    EditionReadingState,
    Ebook,
    ExternalSource
} from '../types/entities.ts';

import { getFirebaseDb } from '../lib/firebase.ts';
import { performFederatedSearch } from './federatedSearch.ts';

import {
    collection,
    query,
    where,
    getDocs,
    limit,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from 'firebase/firestore';

/**
 * LibrarySearchService
 * Authoritative Orchestrator for Bibliographic, Editions, and Ebooks domain.
 * Implements "Ingestion on Intent" to build the BookTown local Source of Truth.
 */
export class LibrarySearchService implements LibrarySearchDataService {

    private getDb() {
        const db = getFirebaseDb();
        if (!db) return null;
        return db;
    }

    /**
     * search
     * Unified search entry point.
     *
     * ✅ ebookOnly is now AUTHORITATIVELY enforced here.
     */
    async search(
        queryText: string,
        options: { lang?: string; limit?: number; ebookOnly?: boolean } = {}
    ): Promise<BookEdition[]> {

        const results: BookEdition[] = [];

        const { limit: resultLimit = 10, ebookOnly = false } = options;

        // Federated Search (authoritative pass-through)
        try {
            const externalResults = await performFederatedSearch(queryText, ebookOnly);

            for (const ext of externalResults) {
                const mapped = this.mapLegacyToEdition(ext.book);

                // 🔒 ENFORCE EBOOK FILTER SERVER-SIDE
                if (ebookOnly && !mapped.ebookAvailable) {
                    continue;
                }

                results.push(mapped);

                // Respect limit
                if (results.length >= resultLimit) break;
            }

        } catch (e) {
            console.error('[LIBRARY_SEARCH] Federated fallback failed:', e);
        }

        return results;
    }

    async getEdition(editionId: string): Promise<BookEdition | null> {
        const db = this.getDb();
        if (!db?.raw) return null;

        const snap = await getDoc(doc(db.raw, 'editions', editionId));
        return snap.exists()
            ? ({ ...snap.data(), editionId: snap.id } as BookEdition)
            : null;
    }

    async getWork(workId: string): Promise<BibliographicWork | null> {
        const db = this.getDb();
        if (!db?.raw) return null;

        const snap = await getDoc(doc(db.raw, 'books', workId));
        return snap.exists()
            ? ({ ...snap.data(), bookId: snap.id } as BibliographicWork)
            : null;
    }

    async getEbook(ebookId: string): Promise<Ebook | null> {
        const db = this.getDb();
        if (!db?.raw) return null;

        const snap = await getDoc(doc(db.raw, 'ebooks', ebookId));
        return snap.exists()
            ? ({ ...snap.data(), ebookId: snap.id } as Ebook)
            : null;
    }

    async getEbookByEdition(editionId: string): Promise<Ebook | null> {
        const db = this.getDb();
        if (!db?.raw) return null;

        const q = query(
            collection(db.raw, 'ebooks'),
            where('editionId', '==', editionId),
            limit(1)
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;

        const d = snap.docs[0];
        return { ...d.data(), ebookId: d.id } as Ebook;
    }

    async getReadingState(
        uid: string,
        editionId: string
    ): Promise<EditionReadingState | null> {
        const db = this.getDb();
        if (!db?.raw) return null;

        const snap = await getDoc(
            doc(db.raw, 'edition_reading_state', `${uid}_${editionId}`)
        );
        return snap.exists()
            ? (snap.data() as EditionReadingState)
            : null;
    }

    async saveReadingState(
        uid: string,
        editionId: string,
        state: Partial<EditionReadingState>
    ): Promise<void> {
        const db = this.getDb();
        if (!db?.raw) return;

        const ref = doc(
            db.raw,
            'edition_reading_state',
            `${uid}_${editionId}`
        );

        await setDoc(
            ref,
            {
                ...state,
                userId: uid,
                editionId,
                lastReadAt: serverTimestamp()
            },
            { merge: true }
        );
    }

    async logExternalSource(source: ExternalSource): Promise<void> {
        const db = this.getDb();
        if (!db?.raw) return;

        const ref = doc(collection(db.raw, 'external_sources'));
        await setDoc(ref, {
            ...source,
            fetchedAt: serverTimestamp()
        });
    }

    /**
     * ingestExternalResult
     * Implementation of Search Ingestion Log and SoT materialization.
     */
    async ingestExternalResult(
        source: 'google_books' | 'open_library',
        externalId: string
    ): Promise<BookEdition> {
        console.log(
            `[LIBRARY_SEARCH][INGEST] Materializing ${source} ID: ${externalId}`
        );
        throw new Error(
            'Ingestion write path requires authenticated backend authority.'
        );
    }

    /**
     * Internal mapper to bridge legacy 'Book' type to new 'BookEdition' schema
     */
    private mapLegacyToEdition(book: any): BookEdition {
        const editionId =
            book.editionId ||
            book.id ||
            `external_${Math.random().toString(36).slice(2)}`;

        return {
            editionId,
            bookId: book.workId || 'unknown_work',
            language: 'en',
            title: book.titleEn || book.title,
            subtitle: '',
            authors: [book.authorEn || book.author].filter(Boolean),
            publisher: 'External Provider',
            publishedDate: book.publicationDate,
            pageCount: book.pageCount,
            categories: book.genresEn || [],
            dimensions: {},
            coverImages: { medium: book.coverUrl },
            description: book.descriptionEn || '',
            editionFormat: 'ebook',
            ebookAvailable: Boolean(
                book.ebookAvailable ||
                book.hasEbook ||
                book.isEbookAvailable
            ),
            otherIdentifiers: [],
            source: editionId.startsWith('gb_')
                ? 'google_books'
                : 'open_library',
            rawSourceRefs: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }
}

export const librarySearchService = new LibrarySearchService();
