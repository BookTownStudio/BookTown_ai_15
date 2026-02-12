import { Post } from '../types/entities.ts';
import { MOCK_DATA } from '../data/mocks.ts';

const getDeepValue = (obj: any, path: string[]) => {
    const flatPath = path.flatMap(p => p.split('/'));
    return flatPath.reduce((acc, part) => acc && acc[part], obj);
}

const setDeepValue = (obj: any, path: string[], value: any) => {
    const flatPath = path.flatMap(p => p.split('/'));
    let current = obj;
    for (let i = 0; i < flatPath.length - 1; i++) {
        const part = flatPath[i];
        if (current[part] === undefined) {
            current[part] = {};
        }
        current = current[part];
    }
    current[flatPath[flatPath.length - 1]] = value;
};

const deleteDeepValue = (obj: any, path: string[]) => {
    const flatPath = path.flatMap(p => p.split('/'));
    let current = obj;
    for (let i = 0; i < flatPath.length - 1; i++) {
        current = current?.[flatPath[i]];
        if (current === undefined) return;
    }
    delete current[flatPath[flatPath.length - 1]];
};

class MockQuery {
    path: string[];
    _limit: number | null = null;
    _startAfter: any | null = null;

    constructor(path: string[]) {
        this.path = path;
    }

    limit(l: number) {
        this._limit = l;
        return this;
    }

    startAfter(cursor: any) {
        this._startAfter = cursor;
        return this;
    }
}


const mockDb = {
    raw: undefined as any,
    doc: (...path: string[]) => {
        return { path };
    },
    collection: (...path: string[]) => {
        return new MockQuery(path);
    },
    getDoc: async (docRef: { path: string[] }) => {
        await new Promise(res => setTimeout(res, 150));
        const data = getDeepValue(MOCK_DATA, docRef.path);
        
        return {
            exists: () => !!data,
            data: () => data,
            id: docRef.path[docRef.path.length - 1],
        };
    },
    getDocs: async (colRef: MockQuery) => {
        await new Promise(res => setTimeout(res, 200));

        if (colRef.path.join('/') === 'posts') {
            const postsObject = getDeepValue(MOCK_DATA, ['posts']);
            const allPosts = postsObject ? Object.values(postsObject) as Post[] : [];
            
            // POST_FEED_PAGINATION_V1: Deterministic sort contract parity
            const sortedPosts = allPosts.sort((a, b) => {
                const timeA = new Date(a.timestamps.createdAt).getTime();
                const timeB = new Date(b.timestamps.createdAt).getTime();
                if (timeB !== timeA) return timeB - timeA;
                return b.id.localeCompare(a.id);
            });
            
            let startIndex = 0;
            if (colRef._startAfter) {
                const cursorId = typeof colRef._startAfter === 'string' 
                    ? colRef._startAfter 
                    : (colRef._startAfter.id || colRef._startAfter.attachmentId);
                
                const cursorIndex = sortedPosts.findIndex(p => p.id === cursorId);
                if (cursorIndex !== -1) {
                    startIndex = cursorIndex + 1;
                }
            }
            
            let finalPosts = sortedPosts.slice(startIndex);

            if (colRef._limit) {
                finalPosts = finalPosts.slice(0, colRef._limit);
            }

            const docs = finalPosts.map(post => ({
                id: post.id,
                data: () => post,
                exists: () => true,
                ref: { id: post.id, path: `posts/${post.id}` }
            }));

            return { 
                docs,
                empty: docs.length === 0,
                size: docs.length
            };
        }

        const collectionData = getDeepValue(MOCK_DATA, colRef.path);
        const docs = collectionData ? Object.keys(collectionData).map(id => ({
            id,
            data: () => collectionData[id],
            exists: () => true,
            ref: { id, path: [...colRef.path, id].join('/') }
        })) : [];

        return {
            docs,
            empty: docs.length === 0,
            size: docs.length
        };
    },
    setDoc: async (docRef: { path: string[] }, data: any) => {
        await new Promise(res => setTimeout(res, 100));
        if (docRef.path.includes('entries')) {
            const existing = getDeepValue(MOCK_DATA, docRef.path);
            if (existing) {
                deleteDeepValue(MOCK_DATA, docRef.path);
            } else {
                 const bookId = docRef.path[docRef.path.length - 1];
                 const shelfId = docRef.path[docRef.path.length - 3];
                 const newData = {
                     bookId,
                     addedAt: new Date().toISOString(),
                     progress: shelfId === 'currently-reading' ? 0 : undefined
                 };
                 setDeepValue(MOCK_DATA, docRef.path, newData);
            }
        } else {
            setDeepValue(MOCK_DATA, docRef.path, data);
        }
        return Promise.resolve();
    },
    addDoc: async (colRef: { path: string[] }, data: any) => {
        await new Promise(res => setTimeout(res, 100));
        const newId = `mock_${Date.now()}`;
        const newPath = [...colRef.path, newId];
        setDeepValue(MOCK_DATA, newPath, data);
        return { id: newId };
    },
    deleteDoc: async (docRef: { path: string[] }) => {
        await new Promise(res => setTimeout(res, 100));
        deleteDeepValue(MOCK_DATA, docRef.path);
        return Promise.resolve();
    },
};

export const db = mockDb;