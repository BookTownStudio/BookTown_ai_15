#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DAY_MS = 24 * 60 * 60 * 1000;

const PRESETS = {
  medium: {
    authors: 24,
    books: 80,
    customShelves: 6,
    projects: 14,
    posts: 28,
    minCommentsPerPost: 1,
    maxCommentsPerPost: 3,
    quotes: 36,
    venues: 10,
    events: 8,
    bookReviews: 30,
    venueReviews: 20,
    drafts: 8,
    readingProgress: 14,
    followAuthors: 10,
    bookmarks: 70,
    likedPosts: 10,
  },
  heavy: {
    authors: 40,
    books: 140,
    customShelves: 10,
    projects: 28,
    posts: 52,
    minCommentsPerPost: 2,
    maxCommentsPerPost: 5,
    quotes: 84,
    venues: 20,
    events: 14,
    bookReviews: 72,
    venueReviews: 46,
    drafts: 18,
    readingProgress: 32,
    followAuthors: 20,
    bookmarks: 140,
    likedPosts: 20,
  },
};

const AUTHOR_FIRST_NAMES = [
  'Aiden', 'Maya', 'Lena', 'Omar', 'Noah', 'Nora', 'Ari', 'Layla', 'Milan', 'Yara',
  'Elias', 'Sofia', 'Rami', 'Hana', 'Leo', 'Zara', 'Tariq', 'Mina', 'Jules', 'Farah',
];

const AUTHOR_LAST_NAMES = [
  'Hart', 'Kamal', 'Rivers', 'Sayegh', 'Marin', 'Darzi', 'Vale', 'Qadri', 'Monroe', 'Rahim',
  'Bennet', 'Nassar', 'Hale', 'Sami', 'Walker', 'Shami', 'Pryce', 'Salim', 'Arden', 'Nouri',
];

const GENRES_EN = [
  'Literary Fiction', 'Mystery', 'Sci-Fi', 'Fantasy', 'History', 'Biography',
  'Poetry', 'Philosophy', 'Business', 'Psychology', 'Memoir', 'Travel',
];

const GENRES_AR = [
  'رواية', 'غموض', 'خيال علمي', 'فانتازيا', 'تاريخ', 'سيرة ذاتية',
  'شعر', 'فلسفة', 'أعمال', 'علم نفس', 'مذكرات', 'سفر',
];

const BOOK_TITLE_ADJ = [
  'Silent', 'Hidden', 'Last', 'Golden', 'Burning', 'Forgotten',
  'Midnight', 'Wandering', 'Shifting', 'Fragile', 'Infinite', 'Restless',
];

const BOOK_TITLE_NOUN = [
  'Harbor', 'Archive', 'Garden', 'Compass', 'Lantern', 'Library',
  'Signal', 'Atlas', 'Promise', 'Mirror', 'Bridge', 'Notebook',
];

const SHELF_NAMES_EN = [
  'Modern Classics', 'Weekend Reads', 'Research Stack', 'Longform Essays',
  'Speculative Worlds', 'Book Club Picks', 'Craft and Technique', 'Slow Reading',
  'Reference Shelf', 'Translated Works', 'Writers I Study', 'Narrative Design',
];

const SHELF_NAMES_AR = [
  'كلاسيكيات حديثة', 'قراءات نهاية الأسبوع', 'مراجع بحثية', 'مقالات طويلة',
  'عوالم تخيّلية', 'اختيارات نادي الكتاب', 'الحرفة والأسلوب', 'قراءة بطيئة',
  'رف المراجع', 'أعمال مترجمة', 'كتّاب أدرسهم', 'تصميم السرد',
];

const PROJECT_TYPES = [
  ['Novel', 'رواية'],
  ['Essay', 'مقال'],
  ['Screenplay', 'سيناريو'],
  ['Memoir', 'مذكرات'],
  ['Research Paper', 'ورقة بحثية'],
  ['Short Story', 'قصة قصيرة'],
];

const PROJECT_STATUSES = ['Idea', 'Draft', 'Revision', 'Final'];

const VENUE_TYPES = ['Bookstore', 'Library', 'Cultural Center', 'Reading Cafe', 'Gallery'];
const EVENT_TYPES = ['Workshop', 'Book Launch', 'Panel', 'Reading Circle', 'Signing'];

const REVIEW_SNIPPETS = [
  'Strong pacing and clear voice. The argument stays focused.',
  'The character work is precise, with layered motivations.',
  'Excellent structure. The final chapters land with impact.',
  'Readable and ambitious, with a few rough transitions.',
  'Insightful and practical. I would recommend this widely.',
  'Dense but rewarding; the middle section is the strongest.',
  'A polished draft with memorable lines and clear stakes.',
];

const QUOTE_SNIPPETS = [
  'A library is not a room; it is a long conversation.',
  'Good writing is careful attention paid over time.',
  'Every chapter is a promise to the next chapter.',
  'Readers follow confidence, not noise.',
  'Clarity is kindness in narrative form.',
  'The most useful sentence is the one that survives editing.',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const withoutPrefix = token.slice(2);
    if (!withoutPrefix) continue;

    if (withoutPrefix.includes('=')) {
      const [k, ...rest] = withoutPrefix.split('=');
      args[k] = rest.join('=');
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[withoutPrefix] = next;
      i += 1;
    } else {
      args[withoutPrefix] = 'true';
    }
  }
  return args;
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
}

function hashSeed(input) {
  const text = String(input);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function intBetween(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, list) {
  return list[intBetween(rng, 0, list.length - 1)];
}

function sampleUnique(rng, list, count) {
  const copy = [...list];
  const picked = [];
  const target = Math.min(count, copy.length);

  for (let i = 0; i < target; i += 1) {
    const idx = intBetween(rng, 0, copy.length - 1);
    picked.push(copy[idx]);
    copy.splice(idx, 1);
  }

  return picked;
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function pad(num, len = 3) {
  return String(num).padStart(len, '0');
}

function normalizeSearchText(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchPrefixes(parts, max = 120) {
  const prefixes = new Set();

  for (const part of parts) {
    const normalized = normalizeSearchText(part);
    if (!normalized) continue;

    for (let i = 1; i <= normalized.length; i += 1) {
      prefixes.add(normalized.slice(0, i));
      if (prefixes.size >= max) return Array.from(prefixes).slice(0, max);
    }

    const tokens = normalized.split(' ').filter(Boolean);
    for (const token of tokens) {
      for (let i = 1; i <= token.length; i += 1) {
        prefixes.add(token.slice(0, i));
        if (prefixes.size >= max) return Array.from(prefixes).slice(0, max);
      }
    }
  }

  return Array.from(prefixes).slice(0, max);
}

function tokenizeSearchText(input, max = 40) {
  const normalized = normalizeSearchText(input);
  if (!normalized) return [];

  const tokens = normalized.split(' ').filter(Boolean);
  const dedup = new Set();

  for (const token of tokens) {
    if (token.length < 2) continue;
    dedup.add(token.slice(0, 40));
    if (dedup.size >= max) break;
  }

  return Array.from(dedup);
}

function timestampDaysAgo(daysAgo, extraSeconds = 0) {
  return admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - (daysAgo * DAY_MS + extraSeconds * 1000))
  );
}

function randomPastTimestamp(rng, maxDaysAgo = 720) {
  const days = intBetween(rng, 1, maxDaysAgo);
  const seconds = intBetween(rng, 0, 86399);
  return timestampDaysAgo(days, seconds);
}

function timestampToIso(value) {
  return value.toDate().toISOString();
}

function stripUndefined(objectValue) {
  return Object.fromEntries(
    Object.entries(objectValue).filter(([, value]) => value !== undefined)
  );
}

function ensureRequired(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return String(value).trim();
}

function loadServiceAccount(args) {
  const explicit = args['service-account']
    ? path.resolve(process.cwd(), args['service-account'])
    : null;

  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : null;

  const repoDefault = path.resolve(__dirname, '../../scripts/serviceAccountKey.json');

  const candidates = [explicit, fromEnv, repoDefault].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;

    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error('Invalid service account payload (missing required fields).');
      }
      return {
        path: candidate,
        credentials: {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
        },
      };
    } catch (err) {
      throw new Error(`Failed to read service account at ${candidate}: ${err.message}`);
    }
  }

  throw new Error(
    'Service account key not found. Provide --service-account=<path> or set GOOGLE_APPLICATION_CREDENTIALS.'
  );
}

class SeedWriter {
  constructor(db, dryRun = false) {
    this.db = db;
    this.dryRun = dryRun;
    this.totalWrites = 0;
    this.counters = {};

    if (!dryRun) {
      this.writer = db.bulkWriter({ throttling: false });
      this.writer.onWriteError((error) => {
        const retryable = error.failedAttempts < 5;
        if (!retryable) {
          console.error('[seed][write-error]', {
            code: error.code,
            message: error.message,
            path: error.documentRef && error.documentRef.path,
          });
        }
        return retryable;
      });
    } else {
      this.writer = null;
    }
  }

  _track(label) {
    this.totalWrites += 1;
    this.counters[label] = (this.counters[label] || 0) + 1;
  }

  set(ref, data, label, merge = true) {
    this._track(label);
    if (this.dryRun) return;

    if (merge) {
      this.writer.set(ref, data, { merge: true });
      return;
    }
    this.writer.set(ref, data);
  }

  async close() {
    if (this.dryRun) return;
    await this.writer.close();
  }
}

function buildProjectContent(titleEn, rng) {
  const paragraphs = [
    `Working title: ${titleEn}. This draft explores character motive, scene tension, and structural pacing with clear milestones.`,
    'The revision plan focuses on clarity first, then emotional precision. Each section is rewritten to improve transitions and remove duplicate exposition.',
    'Chapter design follows a simple loop: setup, pressure, consequence, reflection. The loop repeats with rising stakes and a narrower margin for error.',
    'Research notes are embedded where factual grounding matters. Every external claim is marked for source verification before final publication.',
    'Voice control is intentional: short lines for conflict, longer lines for reflection. Dialogue is tested for rhythm, compression, and subtext.',
    'Final pass checklist: continuity, timeline coherence, thematic consistency, and style normalization.',
  ];

  const count = intBetween(rng, 3, 6);
  return sampleUnique(rng, paragraphs, count).join('\n\n');
}

function buildPostText(rng, book, projectTitle) {
  const templates = [
    `Session note: ${projectTitle} improved after revising the opening hook.`,
    `Currently reading ${book.titleEn}. The pacing model is useful for chapter 2.`,
    'Draft checkpoint complete. Focus for tomorrow: sharper transitions and fewer passive constructions.',
    `Pulled one strong line from ${book.titleEn} and reframed the scene objective.`,
    'Testing a tighter paragraph rhythm in the current draft. Feedback welcome.',
    'Today\'s build: outline cleanup, continuity pass, and targeted language edits.',
  ];

  const first = pick(rng, templates);
  const second = pick(rng, templates);
  return first === second ? first : `${first} ${second}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const uid = ensureRequired(args.uid, 'uid');
  const scaleInput = (args.scale || 'heavy').trim().toLowerCase();
  const scale = PRESETS[scaleInput] ? scaleInput : 'heavy';
  const preset = PRESETS[scale];

  const confirm = String(args.confirm || '').trim().toUpperCase();
  if (confirm !== 'POPULATE') {
    throw new Error('Refusing to run without --confirm=POPULATE');
  }

  const dryRun = normalizeBoolean(args['dry-run'], false);
  const seed = String(args.seed || `${uid}:${scale}:booktown_seed_v1`);
  const rng = createRng(seed);

  const account = loadServiceAccount(args);
  const projectIdArg = args['project-id'] ? String(args['project-id']).trim() : null;
  const projectId = projectIdArg || account.credentials.projectId;

  admin.initializeApp({
    credential: admin.credential.cert(account.credentials),
    projectId,
  });

  const db = admin.firestore();
  const writer = new SeedWriter(db, dryRun);

  console.log('[seed] starting population run');
  console.log('[seed] configuration', {
    uid,
    scale,
    dryRun,
    seed,
    projectId,
    serviceAccountPath: account.path,
  });

  const nowTs = admin.firestore.Timestamp.now();
  const seedNamespace = `seed_${slugify(uid).replace(/-/g, '_').slice(0, 16) || 'user'}`;

  const userRef = db.collection('users').doc(uid);
  const publicProfileRef = db.collection('public_profiles').doc(uid);
  const [userSnap, publicSnap] = await Promise.all([userRef.get(), publicProfileRef.get()]);

  const existingUser = userSnap.exists ? userSnap.data() : {};
  const existingPublic = publicSnap.exists ? publicSnap.data() : {};

  const name =
    (args.name && String(args.name).trim()) ||
    (typeof existingUser?.name === 'string' && existingUser.name.trim()) ||
    (typeof existingPublic?.name === 'string' && existingPublic.name.trim()) ||
    'BookTown Curator';

  const normalizedHandleSource =
    (typeof existingUser?.handle === 'string' && existingUser.handle.trim()) ||
    (typeof existingPublic?.handle === 'string' && existingPublic.handle.trim()) ||
    `@${slugify(name).replace(/-/g, '_').slice(0, 20) || uid.slice(0, 8)}`;

  const handle = normalizedHandleSource.startsWith('@')
    ? normalizedHandleSource
    : `@${normalizedHandleSource}`;

  const avatarUrl =
    (typeof existingUser?.avatarUrl === 'string' && existingUser.avatarUrl.trim()) ||
    (typeof existingPublic?.avatarUrl === 'string' && existingPublic.avatarUrl.trim()) ||
    `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(uid)}`;

  const bannerUrl =
    (typeof existingUser?.bannerUrl === 'string' && existingUser.bannerUrl.trim()) ||
    (typeof existingPublic?.bannerUrl === 'string' && existingPublic.bannerUrl.trim()) ||
    `https://picsum.photos/seed/${encodeURIComponent(seedNamespace + '_banner')}/1600/500`;

  const bioEn =
    (args['bio-en'] && String(args['bio-en']).trim()) ||
    (typeof existingUser?.bioEn === 'string' && existingUser.bioEn.trim()) ||
    'Reader, writer, and curator building a structured reading + publishing workflow on BookTown.';

  const bioAr =
    (args['bio-ar'] && String(args['bio-ar']).trim()) ||
    (typeof existingUser?.bioAr === 'string' && existingUser.bioAr.trim()) ||
    'قارئ وكاتب ومنسّق محتوى يبني سير عمل منظمًا للقراءة والنشر على بوك تاون.';

  const joinDate = existingUser?.joinDate || existingPublic?.joinDate || nowTs;

  const searchPrefixes = buildSearchPrefixes([name, handle, bioEn, bioAr], 140);

  writer.set(
    userRef,
    {
      uid,
      email: typeof existingUser?.email === 'string' ? existingUser.email : null,
      name,
      displayName: name,
      handle,
      avatarUrl,
      bannerUrl,
      bioEn,
      bioAr,
      bio: bioEn,
      role: typeof existingUser?.role === 'string' ? existingUser.role : 'user',
      status: typeof existingUser?.status === 'string' ? existingUser.status : 'active',
      isSuspended: existingUser?.isSuspended === true,
      joinDate,
      lastActive: nowTs,
      updatedAt: nowTs,
      aiConsent: existingUser?.aiConsent === true,
      seedNamespace,
      seedVersion: 1,
      seedUpdatedAt: nowTs,
    },
    'users'
  );

  writer.set(
    publicProfileRef,
    {
      uid,
      name,
      handle,
      avatarUrl,
      bannerUrl,
      bioEn,
      bioAr,
      joinDate,
      updatedAt: nowTs,
      followerCount: typeof existingPublic?.followerCount === 'number' ? existingPublic.followerCount : 0,
      followingCount: typeof existingPublic?.followingCount === 'number' ? existingPublic.followingCount : 0,
      nameNormalized: normalizeSearchText(name),
      handleNormalized: normalizeSearchText(handle),
      bioNormalized: normalizeSearchText(`${bioEn} ${bioAr}`),
      searchTokens: searchPrefixes,
      searchPrefixes,
      seedNamespace,
      seedVersion: 1,
      seedUpdatedAt: nowTs,
    },
    'public_profiles'
  );

  writer.set(
    db.collection('notification_preferences').doc(uid),
    {
      uid,
      channels: { in_app: true, email: false, push: false },
      categories: {
        likes: true,
        comments: true,
        follows: true,
        reposts: true,
        mentions: true,
        quotes: true,
        system: true,
        messages: true,
      },
      createdAt: nowTs,
      updatedAt: nowTs,
    },
    'notification_preferences'
  );

  writer.set(
    db.collection('users').doc(uid).collection('meta').doc('unread'),
    {
      notificationsCount: 0,
      lastUpdatedAt: nowTs,
    },
    'user_meta'
  );

  const authors = [];
  for (let i = 1; i <= preset.authors; i += 1) {
    const first = pick(rng, AUTHOR_FIRST_NAMES);
    const last = pick(rng, AUTHOR_LAST_NAMES);
    const nameEn = `${first} ${last}`;
    const nameAr = `المؤلف ${i}`;
    const authorId = `${seedNamespace}_author_${pad(i, 3)}`;
    const createdAt = randomPastTimestamp(rng, 2000);
    const authorPrefixes = buildSearchPrefixes([nameEn, nameAr], 120);

    const authorDoc = {
      id: authorId,
      nameEn,
      nameAr,
      sourceIds: {},
      sourceRecordType: 'synthetic_seed',
      enrichmentEligible: false,
      avatarUrl: `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(authorId)}`,
      bioEn: `${nameEn} writes on craft, memory, and urban reading culture.`,
      bioAr: `${nameAr} يكتب عن الحرفة والذاكرة وثقافة القراءة الحضرية.`,
      lifespan: `${intBetween(rng, 1950, 1995)} -`,
      countryEn: pick(rng, ['Egypt', 'Jordan', 'Lebanon', 'Morocco', 'UAE', 'UK', 'USA']),
      countryAr: pick(rng, ['مصر', 'الأردن', 'لبنان', 'المغرب', 'الإمارات', 'المملكة المتحدة', 'الولايات المتحدة']),
      languageEn: pick(rng, ['Arabic', 'English', 'Bilingual']),
      languageAr: pick(rng, ['العربية', 'الإنجليزية', 'ثنائي اللغة']),
      signatureQuoteEn: pick(rng, QUOTE_SNIPPETS),
      signatureQuoteAr: `اقتباس مميز رقم ${i}`,
      nameEnNormalized: normalizeSearchText(nameEn),
      nameArNormalized: normalizeSearchText(nameAr),
      searchPrefixes: authorPrefixes,
      popularityScore: intBetween(rng, 80, 950),
      followersCount: intBetween(rng, 20, 1500),
      createdAt,
      updatedAt: nowTs,
      seedNamespace,
      seedVersion: 1,
    };

    authors.push(authorDoc);
    writer.set(db.collection('authors').doc(authorId), authorDoc, 'authors');
  }

  const books = [];
  for (let i = 1; i <= preset.books; i += 1) {
    const bookId = `${seedNamespace}_book_${pad(i, 4)}`;
    const author = pick(rng, authors);
    const genreEn = pick(rng, GENRES_EN);
    const genreAr = GENRES_AR[GENRES_EN.indexOf(genreEn)] || 'رواية';
    const secondGenreEn = pick(rng, GENRES_EN);
    const secondGenreAr = GENRES_AR[GENRES_EN.indexOf(secondGenreEn)] || 'أدب';
    const titleEn = `The ${pick(rng, BOOK_TITLE_ADJ)} ${pick(rng, BOOK_TITLE_NOUN)} ${i}`;
    const titleAr = `كتاب ${i} - ${genreAr}`;
    const createdAt = randomPastTimestamp(rng, 3000);
    const rating = Number((Math.round((rng() * 1.9 + 3.0) * 10) / 10).toFixed(1));
    const ratingsCount = intBetween(rng, 15, 12000);
    const reviewCount = intBetween(rng, 1, Math.max(4, Math.floor(ratingsCount / 50)));

    const bookDoc = {
      id: bookId,
      title: titleEn,
      titleEn,
      titleAr,
      titleEnNormalized: normalizeSearchText(titleEn),
      authorId: author.id,
      author: author.nameEn,
      authorEn: author.nameEn,
      authorAr: author.nameAr,
      authors: [author.nameEn],
      coverUrl: `https://picsum.photos/seed/${encodeURIComponent(bookId)}/480/720`,
      cover: {
        original: `https://picsum.photos/seed/${encodeURIComponent(bookId)}/800/1200`,
        medium: `https://picsum.photos/seed/${encodeURIComponent(bookId)}/480/720`,
      },
      description: `${titleEn} is a ${genreEn.toLowerCase()} study of ambition, craft, and consequence.`,
      descriptionEn: `${titleEn} is a ${genreEn.toLowerCase()} study of ambition, craft, and consequence.`,
      descriptionAr: `يتناول ${titleAr} موضوع الطموح والحرفة والنتائج بأسلوب متماسك.`,
      genresEn: [genreEn, secondGenreEn],
      genresAr: [genreAr, secondGenreAr],
      categories: [genreEn, secondGenreEn],
      rating,
      ratingsCount,
      reviewCount,
      isEbookAvailable: rng() > 0.45,
      hasEbook: rng() > 0.45,
      publicationDate: `${intBetween(rng, 1992, 2024)}-${pad(intBetween(rng, 1, 12), 2)}-${pad(intBetween(rng, 1, 28), 2)}`,
      pageCount: intBetween(rng, 160, 620),
      source: 'seed_script',
      createdAt,
      updatedAt: nowTs,
      seedNamespace,
      seedVersion: 1,
    };

    books.push(bookDoc);
    writer.set(db.collection('books').doc(bookId), bookDoc, 'books');

    writer.set(
      db.collection('book_stats').doc(bookId),
      {
        bookmarks: intBetween(rng, 0, 900),
        reviews: 0,
        ratingsCount,
        averageRating: rating,
        lastUpdatedAt: nowTs,
        seedNamespace,
      },
      'book_stats'
    );
  }

  const bookById = new Map(books.map((book) => [book.id, book]));
  const allBookIds = books.map((book) => book.id);

  const shelves = [];
  const systemShelves = [
    {
      docId: `${uid}_want-to-read`,
      id: 'want-to-read',
      titleEn: 'Want to Read',
      titleAr: 'أرغب في قراءته',
      isSystem: true,
      targetSize: Math.max(18, Math.floor(preset.books * 0.35)),
    },
    {
      docId: `${uid}_finished`,
      id: 'finished',
      titleEn: 'Finished',
      titleAr: 'انتهيت من قراءته',
      isSystem: true,
      targetSize: Math.max(16, Math.floor(preset.books * 0.25)),
    },
  ];

  for (const systemShelf of systemShelves) {
    shelves.push(systemShelf);
  }

  for (let i = 1; i <= preset.customShelves; i += 1) {
    const idx = (i - 1) % SHELF_NAMES_EN.length;
    shelves.push({
      docId: `${uid}_${seedNamespace}_shelf_${pad(i, 2)}`,
      id: `${seedNamespace}_shelf_${pad(i, 2)}`,
      titleEn: SHELF_NAMES_EN[idx],
      titleAr: SHELF_NAMES_AR[idx],
      isSystem: false,
      targetSize: intBetween(rng, 10, 28),
    });
  }

  const libraryMap = new Map();

  for (const shelf of shelves) {
    const entries = {};
    const pickedBooks = sampleUnique(rng, allBookIds, shelf.targetSize);

    for (const bookId of pickedBooks) {
      const book = bookById.get(bookId);
      const addedAtTs = randomPastTimestamp(rng, 520);
      const addedAtIso = timestampToIso(addedAtTs);

      entries[bookId] = {
        bookId,
        addedAt: addedAtIso,
        snapshot: {
          titleEn: book ? book.titleEn : null,
          titleAr: book ? book.titleAr : null,
          coverUrl: book ? book.coverUrl : null,
        },
      };

      if (!libraryMap.has(bookId)) {
        libraryMap.set(bookId, {
          shelfIds: new Set(),
          hasProgress: false,
        });
      }
      libraryMap.get(bookId).shelfIds.add(shelf.id);
    }

    writer.set(
      db.collection('shelves').doc(shelf.docId),
      {
        id: shelf.id,
        ownerId: uid,
        titleEn: shelf.titleEn,
        titleAr: shelf.titleAr,
        entries,
        bookCount: Object.keys(entries).length,
        createdAt: randomPastTimestamp(rng, 900),
        updatedAt: nowTs,
        isSystem: shelf.isSystem,
        isVirtual: false,
        isEditable: !shelf.isSystem,
        isDeletable: !shelf.isSystem,
        seedNamespace,
        seedVersion: 1,
      },
      'shelves'
    );
  }

  const readingBooks = sampleUnique(rng, allBookIds, preset.readingProgress);
  let booksReadCompleted = 0;

  for (const bookId of readingBooks) {
    const stateRoll = rng();
    let statusState = 'reading';
    if (stateRoll > 0.78) statusState = 'completed';
    else if (stateRoll > 0.55) statusState = 'paused';

    const totalPages = intBetween(rng, 180, 640);
    let progress = Number((Math.round(rng() * 80) / 100).toFixed(2));
    if (statusState === 'completed') progress = 1;
    if (progress < 0.06) progress = 0.06;

    const currentPage = Math.max(1, Math.floor(totalPages * progress));
    const progressDocId = `${uid}_${bookId}`;
    const startedAt = randomPastTimestamp(rng, 180);

    if (statusState === 'completed') booksReadCompleted += 1;

    writer.set(
      db.collection('reading_progress').doc(progressDocId),
      {
        uid,
        userId: uid,
        bookId,
        progress,
        lastPosition: {
          page: currentPage,
          totalPages,
        },
        status_state: statusState,
        lastActiveAt: randomPastTimestamp(rng, 30),
        totalActiveSeconds: intBetween(rng, 600, 160000),
        sessionCount: intBetween(rng, 2, 42),
        sessionStartedAt: statusState === 'reading' ? randomPastTimestamp(rng, 3) : null,
        startedAt,
        completedAt: statusState === 'completed' ? randomPastTimestamp(rng, 2) : null,
        updatedAt: nowTs,
        seedNamespace,
      },
      'reading_progress'
    );

    if (!libraryMap.has(bookId)) {
      libraryMap.set(bookId, {
        shelfIds: new Set(),
        hasProgress: true,
      });
    } else {
      libraryMap.get(bookId).hasProgress = true;
    }
  }

  const projects = [];
  let wordsWritten = 0;
  let publishedBooksCount = 0;

  for (let i = 1; i <= preset.projects; i += 1) {
    const projectId = `${seedNamespace}_project_${pad(i, 3)}`;
    const [typeEn, typeAr] = pick(rng, PROJECT_TYPES);
    const status = pick(rng, PROJECT_STATUSES);
    const titleEn = `${typeEn} Draft ${i}`;
    const titleAr = `${typeAr} ${i}`;
    const content = buildProjectContent(titleEn, rng);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const createdAt = randomPastTimestamp(rng, 540);
    const updatedAt = randomPastTimestamp(rng, 120);
    const revision = intBetween(rng, 1, 6);
    const isPublished = rng() > 0.8;

    wordsWritten += wordCount;

    const projectDoc = {
      ownerId: uid,
      uid,
      title: titleEn,
      titleEn,
      titleAr,
      typeEn,
      typeAr,
      status,
      wordCount,
      content,
      isPublished,
      revision,
      source: 'seed_script',
      version: 1,
      createdAt,
      updatedAt,
      seedNamespace,
      seedVersion: 1,
    };

    projects.push({ id: projectId, ...projectDoc });

    writer.set(
      db.collection('users').doc(uid).collection('projects').doc(projectId),
      projectDoc,
      'projects'
    );

    if (isPublished) {
      publishedBooksCount += 1;
      const pubId = `${projectId}_published`;
      writer.set(
        db.collection('users').doc(uid).collection('published_books').doc(pubId),
        {
          id: pubId,
          projectId,
          authorId: uid,
          authorName: name,
          title: `${titleEn} (Published)`,
          description: `${titleEn} published edition with v${revision} editorial pass.`,
          coverUrl: `https://picsum.photos/seed/${encodeURIComponent(pubId)}/640/960`,
          epubUrl: `https://example.invalid/${pubId}.epub`,
          pdfUrl: `https://example.invalid/${pubId}.pdf`,
          publishedAt: timestampToIso(randomPastTimestamp(rng, 90)),
          formats: ['epub', 'pdf'],
          pageCount: intBetween(rng, 120, 520),
          versionNumber: revision,
          createdAt: nowTs,
          updatedAt: nowTs,
          seedNamespace,
          seedVersion: 1,
        },
        'published_books'
      );
    }
  }

  const venues = [];
  for (let i = 1; i <= preset.venues; i += 1) {
    const venueId = `${seedNamespace}_venue_${pad(i, 3)}`;
    const type = pick(rng, VENUE_TYPES);
    const nameEn = `${type} ${i}`;
    const venueDoc = {
      ownerId: uid,
      name: nameEn,
      nameLower: nameEn.toLowerCase(),
      type,
      typeLower: type.toLowerCase(),
      address: `${intBetween(rng, 10, 980)} Main St, District ${intBetween(rng, 1, 9)}`,
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(venueId)}/1000/700`,
      descriptionEn: `${nameEn} hosts reading meetups, launches, and editorial workshops.`,
      descriptionAr: `يستضيف ${nameEn} لقاءات قراءة وورش تحرير وإطلاقات كتب.`,
      openingHours: '09:00-22:00',
      rating: Number((Math.round((rng() * 1.4 + 3.4) * 10) / 10).toFixed(1)),
      ratingsCount: intBetween(rng, 20, 900),
      websiteUrl: `https://example.invalid/${venueId}`,
      phone: `+1-202-555-${pad(intBetween(rng, 1000, 9999), 4)}`,
      createdAt: randomPastTimestamp(rng, 600),
      updatedAt: nowTs,
      seedNamespace,
      seedVersion: 1,
    };

    venues.push({ id: venueId, ...venueDoc });
    writer.set(db.collection('venues').doc(venueId), venueDoc, 'venues');
  }

  const events = [];
  for (let i = 1; i <= preset.events; i += 1) {
    const eventId = `${seedNamespace}_event_${pad(i, 3)}`;
    const type = pick(rng, EVENT_TYPES);
    const titleEn = `${type} Session ${i}`;
    const isOnline = rng() > 0.4;
    const linkedVenue = venues.length > 0 ? pick(rng, venues) : null;
    const eventDate = new Date(Date.now() + intBetween(rng, -30, 120) * DAY_MS);

    const eventDoc = stripUndefined({
      ownerId: uid,
      titleEn,
      titleAr: `فعالية ${i}`,
      titleLower: titleEn.toLowerCase(),
      type,
      typeLower: type.toLowerCase(),
      dateTime: eventDate.toISOString(),
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(eventId)}/1000/700`,
      privacy: rng() > 0.85 ? 'private' : 'public',
      duration: `${intBetween(rng, 60, 180)}m`,
      isOnline,
      venueName: isOnline ? undefined : (linkedVenue ? linkedVenue.name : 'Main Hall'),
      link: isOnline ? `https://example.invalid/events/${eventId}` : undefined,
      createdAt: randomPastTimestamp(rng, 180),
      updatedAt: nowTs,
      seedNamespace,
      seedVersion: 1,
    });

    events.push({ id: eventId, ...eventDoc });
    writer.set(db.collection('events').doc(eventId), eventDoc, 'events');
  }

  const quotes = [];
  for (let i = 1; i <= preset.quotes; i += 1) {
    const quoteId = `${seedNamespace}_quote_${pad(i, 4)}`;
    const book = pick(rng, books);
    const author = authors.find((a) => a.id === book.authorId) || pick(rng, authors);
    const textEn = `${pick(rng, QUOTE_SNIPPETS)} (${i})`;
    const searchTextNormalized = normalizeSearchText(
      `${textEn} اقتباس ${i}: ${textEn} ${book.titleEn} ${book.titleAr}`
    );
    const searchTokens = tokenizeSearchText(searchTextNormalized, 40);

    const quoteDoc = {
      ownerId: uid,
      textEn,
      textAr: `اقتباس ${i}: ${textEn}`,
      sourceEn: book.titleEn,
      sourceAr: book.titleAr,
      bookId: book.id,
      authorId: author.id,
      searchTextNormalized,
      searchTokens,
      isPublic: true,
      createdAt: randomPastTimestamp(rng, 420),
      updatedAt: nowTs,
      version: 1,
      seedNamespace,
      seedVersion: 1,
    };

    quotes.push({ id: quoteId, ...quoteDoc });

    writer.set(
      db.collection('users').doc(uid).collection('quotes').doc(quoteId),
      quoteDoc,
      'quotes'
    );
  }

  const posts = [];
  const commentsPerPost = new Map();

  for (let i = 1; i <= preset.posts; i += 1) {
    const postId = `${seedNamespace}_post_${pad(i, 4)}`;
    const book = pick(rng, books);
    const project = pick(rng, projects);
    const createdAt = randomPastTimestamp(rng, 120);
    const edited = rng() > 0.72;

    const postDoc = {
      authorId: uid,
      authorName: name,
      authorHandle: handle,
      authorAvatar: avatarUrl,
      content: {
        text: buildPostText(rng, book, project.titleEn),
        attachments: [],
      },
      visibility: rng() > 0.9 ? 'followers' : 'public',
      status: 'published',
      isDeleted: false,
      counters: {
        likes: 0,
        comments: 0,
        reposts: 0,
        bookmarks: 0,
      },
      timestamps: {
        createdAt,
        updatedAt: edited ? nowTs : null,
        publishedAt: createdAt,
      },
      flags: {
        edited,
        hasAttachments: false,
      },
      version: 1,
      publishToken: `${postId}_token`,
      seedNamespace,
      seedVersion: 1,
    };

    posts.push({ id: postId, ...postDoc });
    writer.set(db.collection('posts').doc(postId), postDoc, 'posts');

    const commentCount = intBetween(
      rng,
      preset.minCommentsPerPost,
      preset.maxCommentsPerPost
    );

    commentsPerPost.set(postId, commentCount);

    for (let j = 1; j <= commentCount; j += 1) {
      const commentId = `${seedNamespace}_c_${pad(i, 4)}_${pad(j, 2)}`;
      const commentTs = randomPastTimestamp(rng, 100);
      writer.set(
        db.collection('posts').doc(postId).collection('comments').doc(commentId),
        {
          authorId: uid,
          authorName: name,
          authorHandle: handle,
          authorAvatar: avatarUrl,
          text: `Comment ${j} on post ${i}: ${pick(rng, REVIEW_SNIPPETS)}`,
          timestamp: commentTs,
          parentId: null,
          likesCount: intBetween(rng, 0, 16),
          status: 'published',
          version: 1,
          updatedAt: nowTs,
          seedNamespace,
          seedVersion: 1,
        },
        'post_comments'
      );
    }
  }

  const likedPosts = sampleUnique(rng, posts.map((p) => p.id), preset.likedPosts);
  for (const postId of likedPosts) {
    writer.set(
      db.collection('users').doc(uid).collection('likes').doc(postId),
      {
        postId,
        createdAt: randomPastTimestamp(rng, 60),
        version: 1,
        seedNamespace,
      },
      'post_likes'
    );
  }

  const postCommentCounts = new Map(commentsPerPost);
  for (const post of posts) {
    writer.set(
      db.collection('posts').doc(post.id),
      {
        counters: {
          likes: likedPosts.includes(post.id) ? 1 : 0,
          comments: postCommentCounts.get(post.id) || 0,
          reposts: 0,
          bookmarks: 0,
        },
      },
      'post_counter_patch'
    );
  }

  const reviewsPerBook = new Map();

  for (let i = 1; i <= preset.bookReviews; i += 1) {
    const book = pick(rng, books);
    const reviewId = `${seedNamespace}_book_review_${pad(i, 4)}`;
    const rating = intBetween(rng, 3, 5);

    reviewsPerBook.set(book.id, (reviewsPerBook.get(book.id) || 0) + 1);

    writer.set(
      db.collection('books').doc(book.id).collection('reviews').doc(reviewId),
      {
        bookId: book.id,
        userId: uid,
        rating,
        text: `${pick(rng, REVIEW_SNIPPETS)} [Book ${book.titleEn}]`,
        authorName: name,
        authorHandle: handle,
        authorAvatar: avatarUrl,
        upvotes: intBetween(rng, 0, 220),
        downvotes: intBetween(rng, 0, 18),
        commentsCount: intBetween(rng, 0, 12),
        createdAt: randomPastTimestamp(rng, 420),
        updatedAt: nowTs,
        seedNamespace,
      },
      'book_reviews'
    );
  }

  for (const [bookId, reviewCount] of reviewsPerBook.entries()) {
    writer.set(
      db.collection('books').doc(bookId),
      {
        reviewCount,
        updatedAt: nowTs,
      },
      'book_review_count_patch'
    );
  }

  const venueAndEventTargets = [
    ...venues.map((v) => ({
      id: v.id,
      collection: 'venues',
      name: v.name,
    })),
    ...events.map((e) => ({
      id: e.id,
      collection: 'events',
      name: e.titleEn,
    })),
  ];

  for (let i = 1; i <= preset.venueReviews; i += 1) {
    const target = pick(rng, venueAndEventTargets);
    const reviewId = `${seedNamespace}_venue_review_${pad(i, 4)}`;

    writer.set(
      db.collection(target.collection).doc(target.id).collection('reviews').doc(reviewId),
      {
        venueId: target.id,
        userId: uid,
        rating: intBetween(rng, 3, 5),
        text: `${pick(rng, REVIEW_SNIPPETS)} [${target.name}]`,
        authorName: name,
        authorHandle: handle,
        authorAvatar: avatarUrl,
        upvotes: intBetween(rng, 0, 120),
        downvotes: intBetween(rng, 0, 10),
        commentsCount: intBetween(rng, 0, 8),
        timestamp: randomPastTimestamp(rng, 180),
        updatedAt: nowTs,
        seedNamespace,
      },
      'venue_reviews'
    );
  }

  for (let i = 1; i <= preset.drafts; i += 1) {
    const draftId = `${seedNamespace}_draft_${pad(i, 3)}`;
    const draftText = buildPostText(rng, pick(rng, books), pick(rng, projects).titleEn);

    writer.set(
      db.collection('users').doc(uid).collection('drafts').doc(draftId),
      {
        userId: uid,
        content: draftText,
        updatedAt: randomPastTimestamp(rng, 30),
        createdAt: randomPastTimestamp(rng, 50),
        seedNamespace,
      },
      'drafts'
    );
  }

  const followedAuthorIds = sampleUnique(rng, authors.map((a) => a.id), preset.followAuthors);
  for (const authorId of followedAuthorIds) {
    writer.set(
      db.collection('users').doc(uid).collection('follows_authors').doc(authorId),
      {
        uid,
        authorId,
        createdAt: randomPastTimestamp(rng, 180),
        updatedAt: nowTs,
        seedNamespace,
      },
      'followed_authors'
    );

    writer.set(
      db.collection('authors').doc(authorId),
      {
        followersCount: admin.firestore.FieldValue.increment(1),
        updatedAt: nowTs,
      },
      'author_follower_increments'
    );
  }

  const bookmarkCandidates = [];
  for (const book of books) {
    bookmarkCandidates.push({ id: book.id, type: 'book', entityId: book.id });
  }
  for (const quote of quotes) {
    bookmarkCandidates.push({
      id: quote.id,
      type: 'quote',
      entityId: quote.id,
      quoteOwnerId: uid,
    });
  }
  for (const author of authors) {
    bookmarkCandidates.push({ id: author.id, type: 'author', entityId: author.id });
  }
  for (const venue of venues) {
    bookmarkCandidates.push({ id: venue.id, type: 'venue', entityId: venue.id });
  }
  for (const event of events) {
    bookmarkCandidates.push({ id: event.id, type: 'event', entityId: event.id });
  }
  for (const post of posts) {
    bookmarkCandidates.push({ id: post.id, type: 'post', entityId: post.id });
  }

  const selectedBookmarks = sampleUnique(rng, bookmarkCandidates, preset.bookmarks);
  const postBookmarkCounts = new Map();

  for (const bookmark of selectedBookmarks) {
    if (bookmark.type === 'post') {
      postBookmarkCounts.set(
        bookmark.entityId,
        (postBookmarkCounts.get(bookmark.entityId) || 0) + 1
      );
    }

    writer.set(
      db.collection('users').doc(uid).collection('bookmarks').doc(bookmark.id),
      {
        type: bookmark.type,
        entityId: bookmark.entityId,
        quoteOwnerId: bookmark.quoteOwnerId || null,
        timestamp: randomPastTimestamp(rng, 320),
        version: 1,
        seedNamespace,
      },
      'bookmarks'
    );
  }

  for (const post of posts) {
    const bookmarkCount = postBookmarkCounts.get(post.id) || 0;
    if (!bookmarkCount) continue;

    writer.set(
      db.collection('posts').doc(post.id),
      {
        counters: {
          likes: likedPosts.includes(post.id) ? 1 : 0,
          comments: postCommentCounts.get(post.id) || 0,
          reposts: 0,
          bookmarks: bookmarkCount,
        },
      },
      'post_bookmark_counter_patch'
    );
  }

  const totalShelves = shelves.length;
  const totalBooks = libraryMap.size;

  for (const [bookId, data] of libraryMap.entries()) {
    writer.set(
      db.collection('user_library_books').doc(`${uid}_${bookId}`),
      {
        uid,
        bookId,
        shelfIds: Array.from(data.shelfIds),
        hasProgress: data.hasProgress,
        updatedAt: nowTs,
        seedNamespace,
        seedVersion: 1,
      },
      'user_library_books'
    );
  }

  const postCount = posts.length;
  const totalReviews = preset.bookReviews + preset.venueReviews;

  writer.set(
    db.collection('user_stats').doc(uid),
    {
      followers: 0,
      following: 0,
      posts: postCount,
      reviews: totalReviews,
      booksRead: booksReadCompleted,
      booksPublished: publishedBooksCount,
      wordsWritten,
      postsPublished: postCount,
      shelvesCreated: totalShelves,
      quotesAuthored: quotes.length,
      booksReadTotal: booksReadCompleted,
      counters: {
        followers: 0,
        following: 0,
        totalShelves,
        totalBooks,
        posts: postCount,
        reviews: totalReviews,
        booksRead: booksReadCompleted,
        wordsWritten,
        quotesAuthored: quotes.length,
      },
      profileCompletionScore: 100,
      pcsVersion: 'seed_script_v1',
      updatedAt: nowTs,
      lastUpdatedAt: nowTs,
      seedNamespace,
      seedVersion: 1,
    },
    'user_stats'
  );

  writer.set(
    userRef,
    {
      followers: 0,
      following: 0,
      booksRead: booksReadCompleted,
      quotesSaved: quotes.length,
      shelvesCount: totalShelves,
      wordsWritten,
      updatedAt: nowTs,
    },
    'user_stats_patch'
  );

  await writer.close();

  const summary = {
    uid,
    scale,
    dryRun,
    seed,
    totalWritesPlanned: writer.totalWrites,
    writesByCategory: writer.counters,
    totals: {
      authors: authors.length,
      books: books.length,
      shelves: shelves.length,
      projects: projects.length,
      posts: posts.length,
      quotes: quotes.length,
      venues: venues.length,
      events: events.length,
      uniqueLibraryBooks: totalBooks,
      bookmarks: selectedBookmarks.length,
      readingProgress: readingBooks.length,
      bookReviews: preset.bookReviews,
      venueReviews: preset.venueReviews,
    },
  };

  console.log('[seed] completed successfully');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[seed] failed', {
    message: error && error.message,
    stack: error && error.stack,
  });
  process.exitCode = 1;
});
