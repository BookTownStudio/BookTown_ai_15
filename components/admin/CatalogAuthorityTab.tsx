import React, { useEffect, useState } from 'react';

import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useMutation, useQuery, useQueryClient } from '../../lib/react-query.ts';
import {
  adminService,
  adminServiceQueryKeys,
  type AdminAuthorImportCandidate,
  type AdminAuthorRecord,
  type AdminCanonicalBatchRow,
  type AdminCanonicalBookRecord,
  type AdminDeleteBookResult,
  type AdminDeleteSeedListRow,
  type AdminQuoteImportJob,
  type AdminQuoteRecord,
} from '../../lib/services/adminService.ts';
import { cn } from '../../lib/utils.ts';
import { useI18n } from '../../store/i18n.tsx';

type CatalogSubview = 'authors' | 'books' | 'quotes';

type AuthorDraft = {
  authorId?: string;
  canonicalName: string;
  displayName: string;
  aliases: string;
  birthDate: string;
  deathDate: string;
  birthPlace: string;
  deathPlace: string;
  nationality: string;
  languages: string;
  genres: string;
  movements: string;
  period: string;
  themes: string;
  influenceTags: string;
  shortBio: string;
  fullBio: string;
  wikipediaUrl: string;
  goodreadsId: string;
  openLibraryId: string;
  wikidataId: string;
  isni: string;
  viaf: string;
  portraitUrl: string;
  gallery: string;
  knownWorks: string;
  bookIds: string;
  status: 'active' | 'archived';
  source: string;
  primarySource: string;
};

type QuoteDraft = {
  quoteId?: string;
  textEn: string;
  textAr: string;
  sourceEn: string;
  sourceAr: string;
  authorId: string;
  bookId: string;
  chapter: string;
  page: string;
  section: string;
  year: string;
  language: string;
  originalLanguage: string;
  translatedFrom: string;
  translationStatus: string;
  themes: string;
  mood: string;
  concepts: string;
  keywords: string;
  attributionConfidence: string;
  sourceType: string;
  sourceReference: string;
  isPublic: boolean;
  status: 'active' | 'archived';
};

type BookDraft = {
  title: string;
  author: string;
  language: string;
  isbn: string;
  description: string;
  coverUrl: string;
};

type BookBatchSummary = {
  successCount: number;
  existingCount: number;
  failedCount: number;
};

type DeleteBatchSummary = {
  successCount: number;
  missingCount: number;
  failedCount: number;
};

type BulkResult = {
  row: number;
  status: 'created' | 'updated' | 'imported' | 'duplicate' | 'error';
  message: string;
};

function emptyAuthorDraft(): AuthorDraft {
  return {
    canonicalName: '',
    displayName: '',
    aliases: '',
    birthDate: '',
    deathDate: '',
    birthPlace: '',
    deathPlace: '',
    nationality: '',
    languages: '',
    genres: '',
    movements: '',
    period: '',
    themes: '',
    influenceTags: '',
    shortBio: '',
    fullBio: '',
    wikipediaUrl: '',
    goodreadsId: '',
    openLibraryId: '',
    wikidataId: '',
    isni: '',
    viaf: '',
    portraitUrl: '',
    gallery: '',
    knownWorks: '',
    bookIds: '',
    status: 'active',
    source: 'admin_manual',
    primarySource: 'manual',
  };
}

function emptyQuoteDraft(): QuoteDraft {
  return {
    textEn: '',
    textAr: '',
    sourceEn: '',
    sourceAr: '',
    authorId: '',
    bookId: '',
    chapter: '',
    page: '',
    section: '',
    year: '',
    language: '',
    originalLanguage: '',
    translatedFrom: '',
    translationStatus: '',
    themes: '',
    mood: '',
    concepts: '',
    keywords: '',
    attributionConfidence: '',
    sourceType: 'manual',
    sourceReference: '',
    isPublic: true,
    status: 'active',
  };
}

function emptyBookDraft(): BookDraft {
  return {
    title: '',
    author: '',
    language: '',
    isbn: '',
    description: '',
    coverUrl: '',
  };
}

function listToString(values: readonly string[] | undefined): string {
  return Array.isArray(values) ? values.join(', ') : '';
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildAuthorDraft(author: AdminAuthorRecord | null | undefined): AuthorDraft {
  if (!author) return emptyAuthorDraft();
  return {
    authorId: author.authorId,
    canonicalName: author.canonicalName,
    displayName: author.displayName,
    aliases: listToString(author.aliases),
    birthDate: author.birthDate ?? '',
    deathDate: author.deathDate ?? '',
    birthPlace: author.birthPlace ?? '',
    deathPlace: author.deathPlace ?? '',
    nationality: author.nationality ?? '',
    languages: listToString(author.languages),
    genres: listToString(author.genres),
    movements: listToString(author.movements),
    period: author.period ?? '',
    themes: listToString(author.themes),
    influenceTags: listToString(author.influenceTags),
    shortBio: author.shortBio ?? '',
    fullBio: author.fullBio ?? '',
    wikipediaUrl: author.wikipediaUrl ?? '',
    goodreadsId: author.goodreadsId ?? '',
    openLibraryId: author.openLibraryId ?? '',
    wikidataId: author.wikidataId ?? '',
    isni: author.isni ?? '',
    viaf: author.viaf ?? '',
    portraitUrl: author.portraitUrl ?? '',
    gallery: listToString(author.gallery),
    knownWorks: listToString(author.knownWorks),
    bookIds: listToString(author.bookIds),
    status: author.status,
    source: author.source ?? 'admin_manual',
    primarySource: author.primarySource ?? 'manual',
  };
}

function buildQuoteDraft(quote: AdminQuoteRecord | null | undefined): QuoteDraft {
  if (!quote) return emptyQuoteDraft();
  return {
    quoteId: quote.quoteId,
    textEn: quote.textEn,
    textAr: quote.textAr,
    sourceEn: quote.sourceEn,
    sourceAr: quote.sourceAr,
    authorId: quote.authorId ?? '',
    bookId: quote.bookId ?? '',
    chapter: quote.chapter ?? '',
    page: typeof quote.page === 'number' ? String(quote.page) : '',
    section: quote.section ?? '',
    year: typeof quote.year === 'number' ? String(quote.year) : '',
    language: quote.language ?? '',
    originalLanguage: quote.originalLanguage ?? '',
    translatedFrom: quote.translatedFrom ?? '',
    translationStatus: quote.translationStatus ?? '',
    themes: listToString(quote.themes),
    mood: quote.mood ?? '',
    concepts: listToString(quote.concepts),
    keywords: listToString(quote.keywords),
    attributionConfidence:
      typeof quote.attributionConfidence === 'number'
        ? String(quote.attributionConfidence)
        : '',
    sourceType: quote.sourceType ?? 'manual',
    sourceReference: quote.sourceReference ?? '',
    isPublic: quote.isPublic,
    status: quote.status,
  };
}

function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushRow = () => {
    if (row.length === 0 && field.length === 0) return;
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      pushRow();
      continue;
    }
    if (char === '\r') {
      continue;
    }
    field += char;
  }

  pushRow();
  if (rows.length === 0) return [];

  const [headerRow, ...valueRows] = rows;
  const headers = headerRow.map((entry) => normalizeCsvHeader(entry));
  return valueRows
    .filter((valueRow) => valueRow.some((entry) => entry.trim().length > 0))
    .map((valueRow) =>
      headers.reduce<Record<string, string>>((acc, header, index) => {
        if (header) {
          acc[header] = (valueRow[index] ?? '').trim();
        }
        return acc;
      }, {})
    );
}

const TextAreaField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}> = ({ id, label, value, onChange, rows = 4 }) => (
  <div>
    <label htmlFor={id}>
      <BilingualText role="Caption" className="!text-slate-400 mb-1 block">
        {label}
      </BilingualText>
    </label>
    <textarea
      id={id}
      value={value}
      rows={rows}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-accent"
    />
  </div>
);

const SelectField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ id, label, value, onChange, options }) => (
  <div>
    <label htmlFor={id}>
      <BilingualText role="Caption" className="!text-slate-400 mb-1 block">
        {label}
      </BilingualText>
    </label>
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-12 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-white focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

const SubtabButton: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
      active ? 'bg-primary text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
    )}
  >
    {label}
  </button>
);

const BooksPanel: React.FC = () => {
  const [draft, setDraft] = useState<BookDraft>(emptyBookDraft());
  const [batchInput, setBatchInput] = useState('');
  const [batchRows, setBatchRows] = useState<AdminCanonicalBatchRow[]>([]);
  const [batchSummary, setBatchSummary] = useState<BookBatchSummary | null>(null);
  const [deleteListInput, setDeleteListInput] = useState('');
  const [deleteRows, setDeleteRows] = useState<AdminDeleteSeedListRow[]>([]);
  const [deleteSummary, setDeleteSummary] = useState<DeleteBatchSummary | null>(null);
  const [hardDeleteBookId, setHardDeleteBookId] = useState('');
  const [hardDeletePreview, setHardDeletePreview] = useState<AdminDeleteBookResult | null>(null);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState('');
  const [createdBook, setCreatedBook] = useState<AdminCanonicalBookRecord | null>(null);
  const [submitMessage, setSubmitMessage] = useState('');

  const createMutation = useMutation({
    mutationFn: async (nextDraft: BookDraft) =>
      adminService.createCanonicalBook({
        title: nextDraft.title.trim(),
        author: nextDraft.author.trim(),
        ...(nextDraft.language.trim() ? { language: nextDraft.language.trim() } : {}),
        ...(nextDraft.isbn.trim() ? { isbn: nextDraft.isbn.trim() } : {}),
        ...(nextDraft.description.trim() ? { description: nextDraft.description.trim() } : {}),
        ...(nextDraft.coverUrl.trim() ? { coverUrl: nextDraft.coverUrl.trim() } : {}),
      }),
    onSuccess: (result) => {
      setCreatedBook(result.book);
      setSubmitMessage(
        result.status === 'MERGED'
          ? 'Canonical book matched an existing authority row.'
          : 'Canonical book created through the shared authority engine.'
      );
      setDraft(emptyBookDraft());
    },
    onError: (error) => {
      setSubmitMessage(error instanceof Error ? error.message : 'Canonical book creation failed.');
    },
  });
  const isSubmitting = createMutation.status === 'pending';
  const batchMutation = useMutation({
    mutationFn: async (rows: string) => adminService.seedCanonicalBatch({ rows }),
    onSuccess: (result) => {
      setBatchRows(result.rows);
      setBatchSummary(result.summary);
      setSubmitMessage(
        `Batch completed: ${result.summary.successCount} success, ${result.summary.existingCount} existing, ${result.summary.failedCount} failed.`
      );
    },
    onError: (error) => {
      setSubmitMessage(error instanceof Error ? error.message : 'Canonical batch creation failed.');
    },
  });
  const isBatchSubmitting = batchMutation.status === 'pending';
  const deleteBookMutation = useMutation({
    mutationFn: async (bookId: string) => adminService.deleteCanonicalBook({ bookId }),
    onSuccess: (result) => {
      setSubmitMessage(`Deleted canonical book ${result.bookId}.`);
      setCreatedBook((current) => (current?.bookId === result.bookId ? null : current));
      setBatchRows((current) => current.filter((row) => row.canonicalBookId !== result.bookId));
    },
    onError: (error) => {
      setSubmitMessage(error instanceof Error ? error.message : 'Canonical book deletion failed.');
    },
  });
  const deleteListMutation = useMutation({
    mutationFn: async (rows: string) => adminService.deleteCanonicalSeedList({ rows }),
    onSuccess: (result) => {
      setDeleteRows(result.rows);
      setDeleteSummary(result.summary);
      setSubmitMessage(
        `Delete list completed: ${result.summary.successCount} success, ${result.summary.missingCount} missing, ${result.summary.failedCount} failed.`
      );
    },
    onError: (error) => {
      setSubmitMessage(error instanceof Error ? error.message : 'Seed list deletion failed.');
    },
  });
  const resolveHardDeleteMutation = useMutation({
    mutationFn: async (bookId: string) =>
      adminService.deleteCanonicalBook({
        bookId,
        dryRun: true,
      }),
    onSuccess: (result) => {
      setHardDeletePreview(result);
      setSubmitMessage(
        result.resolved
          ? `Resolved ${result.inputType || 'book'} to canonical work ${result.bookId}.`
          : `No canonical work matched ${result.bookId}.`
      );
    },
    onError: (error) => {
      setHardDeletePreview(null);
      setSubmitMessage(error instanceof Error ? error.message : 'Hard delete resolution failed.');
    },
  });
  const confirmHardDeleteMutation = useMutation({
    mutationFn: async (preview: AdminDeleteBookResult) =>
      adminService.deleteCanonicalBook({
        bookId: preview.deleteGraph?.inputId || hardDeleteBookId.trim(),
        confirmation: preview.bookId,
      }),
    onSuccess: (result) => {
      setSubmitMessage(`Deleted canonical book ${result.bookId}.`);
      setCreatedBook((current) => (current?.bookId === result.bookId ? null : current));
      setBatchRows((current) => current.filter((row) => row.canonicalBookId !== result.bookId));
      setHardDeleteBookId('');
      setHardDeletePreview(null);
    },
    onError: (error) => {
      setSubmitMessage(error instanceof Error ? error.message : 'Hard delete failed.');
    },
  });
  const deleteAllMutation = useMutation({
    mutationFn: async (confirmation: string) => adminService.deleteAllBooks({ confirmation }),
    onSuccess: (result) => {
      setSubmitMessage(`Deleted ${result.deletedCount} books from catalog authority.`);
      setCreatedBook(null);
      setBatchRows([]);
      setBatchSummary(null);
      setDeleteRows([]);
      setDeleteSummary(null);
      setDeleteAllConfirmation('');
    },
    onError: (error) => {
      setSubmitMessage(error instanceof Error ? error.message : 'Delete all books failed.');
    },
  });
  const hardDeleteCountEntries = hardDeletePreview
    ? [
        ...Object.entries(hardDeletePreview.collectionCounts || {}),
        ...Object.entries(hardDeletePreview.storageCounts || {}).map(([key, value]) => [`storage.${key}`, value] as const),
      ].filter(([, value]) => value > 0)
    : [];

  return (
    <div className="space-y-6">
      <GlassCard className="!p-5 space-y-4">
        <div>
          <BilingualText role="H1" className="!text-xl">
            Books Authority
          </BilingualText>
          <p className="mt-2 text-sm text-slate-400">
            Create canonical books through the backend authority materializer.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-4 space-y-4">
          <div>
            <BilingualText role="H2" className="!text-lg">
              Bulk Canonical Seed
            </BilingualText>
            <p className="mt-2 text-sm text-slate-400">
              Paste one book per line using <span className="font-mono">Title | Author</span>.
            </p>
          </div>
          <TextAreaField
            id="book-batch-rows"
            label="Canonical Seed Rows"
            value={batchInput}
            onChange={setBatchInput}
            rows={8}
          />
          <div className="flex gap-3">
            <Button
              onClick={() => batchMutation.mutate(batchInput)}
              disabled={isBatchSubmitting || batchInput.trim().length === 0}
            >
              Build Canonical Batch
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setBatchInput('');
                setBatchRows([]);
                setBatchSummary(null);
              }}
            >
              Clear Batch
            </Button>
          </div>
          {batchSummary ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-500">Success</div>
                <div>{batchSummary.successCount}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-500">Existing</div>
                <div>{batchSummary.existingCount}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-500">Failed</div>
                <div>{batchSummary.failedCount}</div>
              </div>
            </div>
          ) : null}
          {batchRows.length > 0 ? (
            <div className="space-y-3">
              {batchRows.map((row) => (
                <div
                  key={`${row.row}-${row.input}`}
                  className="rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm text-slate-300"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                    <span>Row {row.row}</span>
                    <span>{row.status}</span>
                    {row.source ? <span>{row.source}</span> : null}
                  </div>
                  <div className="mt-2 font-medium text-white">{row.title}</div>
                  <div className="text-slate-400">{row.author}</div>
                  {row.canonicalBookId ? (
                    <div className="mt-2 text-xs text-slate-400">Canonical ID: {row.canonicalBookId}</div>
                  ) : null}
                  {row.message ? (
                    <div className="mt-2 text-xs text-rose-300">{row.message}</div>
                  ) : null}
                  {row.canonicalBookId ? (
                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        onClick={() => deleteBookMutation.mutate(row.canonicalBookId!)}
                        disabled={deleteBookMutation.status === 'pending'}
                      >
                        Delete Book
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/10 p-4 space-y-4">
          <div>
            <BilingualText role="H2" className="!text-lg">
              Delete Seed List
            </BilingualText>
            <p className="mt-2 text-sm text-slate-400">
              Paste one canonical book per line using <span className="font-mono">Title | Author</span>.
            </p>
          </div>
          <TextAreaField
            id="book-delete-list"
            label="Delete Rows"
            value={deleteListInput}
            onChange={setDeleteListInput}
            rows={6}
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => deleteListMutation.mutate(deleteListInput)}
              disabled={deleteListMutation.status === 'pending' || deleteListInput.trim().length === 0}
            >
              Delete Seed List
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteListInput('');
                setDeleteRows([]);
                setDeleteSummary(null);
              }}
            >
              Clear Delete List
            </Button>
          </div>
          {deleteSummary ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-500">Success</div>
                <div>{deleteSummary.successCount}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-500">Missing</div>
                <div>{deleteSummary.missingCount}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-500">Failed</div>
                <div>{deleteSummary.failedCount}</div>
              </div>
            </div>
          ) : null}
          {deleteRows.length > 0 ? (
            <div className="space-y-3">
              {deleteRows.map((row) => (
                <div
                  key={`${row.row}-${row.input}-delete`}
                  className="rounded-lg border border-white/10 bg-black/10 px-3 py-3 text-sm text-slate-300"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                    <span>Row {row.row}</span>
                    <span>{row.status}</span>
                  </div>
                  <div className="mt-2 font-medium text-white">{row.title}</div>
                  <div className="text-slate-400">{row.author}</div>
                  {row.bookId ? (
                    <div className="mt-2 text-xs text-slate-400">Deleted Book ID: {row.bookId}</div>
                  ) : null}
                  {row.message ? (
                    <div className="mt-2 text-xs text-rose-300">{row.message}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <InputField
            id="book-title"
            label="Title"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
          <InputField
            id="book-author"
            label="Author"
            value={draft.author}
            onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))}
          />
          <InputField
            id="book-language"
            label="Language"
            value={draft.language}
            onChange={(event) => setDraft((current) => ({ ...current, language: event.target.value }))}
          />
          <InputField
            id="book-isbn"
            label="ISBN"
            value={draft.isbn}
            onChange={(event) => setDraft((current) => ({ ...current, isbn: event.target.value }))}
          />
          <InputField
            id="book-cover-url"
            label="Cover URL"
            value={draft.coverUrl}
            onChange={(event) => setDraft((current) => ({ ...current, coverUrl: event.target.value }))}
          />
          <div className="md:col-span-2">
            <TextAreaField
              id="book-description"
              label="Description"
              value={draft.description}
              onChange={(value) => setDraft((current) => ({ ...current, description: value }))}
              rows={5}
            />
          </div>
        </div>

        {submitMessage ? (
          <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
            {submitMessage}
          </div>
        ) : null}

        <div className="flex gap-3">
          <Button
            onClick={() => createMutation.mutate(draft)}
            disabled={
              isSubmitting ||
              draft.title.trim().length === 0 ||
              draft.author.trim().length === 0
            }
          >
            Create Canonical Book
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(emptyBookDraft());
              setSubmitMessage('');
            }}
          >
            Reset
          </Button>
        </div>
      </GlassCard>

      {createdBook ? (
        <GlassCard className="!p-5 space-y-3">
          <BilingualText role="H2" className="!text-lg">
            Created Book
          </BilingualText>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Book ID</div>
              <div>{createdBook.bookId}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Canonical Key</div>
              <div>{createdBook.canonicalKey}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Author ID</div>
              <div>{createdBook.authorId || 'Not set'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Author Canonical Key</div>
              <div>{createdBook.authorCanonicalKey || 'Not set'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Authority Status</div>
              <div>{createdBook.authorityStatus}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Canonical Locked</div>
              <div>{createdBook.canonicalLocked ? 'true' : 'false'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Cover State</div>
              <div>{createdBook.coverState || 'No cover job'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Cover Source</div>
              <div>{createdBook.coverSource || 'Not set'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Cover Authority</div>
              <div>{typeof createdBook.coverAuthority === 'number' ? createdBook.coverAuthority : 'Not set'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Description Source</div>
              <div>{createdBook.descriptionSource || 'Not set'}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Description Authority</div>
              <div>
                {typeof createdBook.descriptionAuthority === 'number'
                  ? createdBook.descriptionAuthority
                  : 'Not set'}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
              <div className="text-xs uppercase tracking-wide text-slate-500">Edition ID</div>
              <div>{createdBook.editionId || 'No edition'}</div>
            </div>
          </div>
          <div className="pt-2">
            <Button
              variant="secondary"
              onClick={() => deleteBookMutation.mutate(createdBook.bookId)}
              disabled={deleteBookMutation.status === 'pending'}
            >
              Delete Book
            </Button>
          </div>
        </GlassCard>
      ) : null}

      <GlassCard className="!p-5 space-y-4">
        <div>
          <BilingualText role="H2" className="!text-lg">
            Hard Delete by BookTown ID
          </BilingualText>
          <p className="mt-2 text-sm text-slate-400">
            Paste one canonical work ID or edition ID. The backend resolves the target first, shows the full delete graph, and only then allows the hard delete.
          </p>
        </div>
        <InputField
          id="hard-delete-book-id"
          label="BookTown Book ID"
          value={hardDeleteBookId}
          onChange={(event) => {
            setHardDeleteBookId(event.target.value);
            setHardDeletePreview(null);
          }}
        />
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => resolveHardDeleteMutation.mutate(hardDeleteBookId.trim())}
            disabled={resolveHardDeleteMutation.status === 'pending' || hardDeleteBookId.trim().length === 0}
          >
            Resolve Delete Graph
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setHardDeleteBookId('');
              setHardDeletePreview(null);
            }}
          >
            Clear
          </Button>
        </div>
        {hardDeletePreview ? (
          <div className="rounded-lg border border-white/10 bg-black/10 p-4 space-y-3 text-sm text-slate-300">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-slate-500">Resolved Work ID</div>
                <div>{hardDeletePreview.deleteGraph?.resolvedBookId || 'Not found'}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-slate-500">Input Type</div>
                <div>{hardDeletePreview.inputType || 'unresolved'}</div>
              </div>
            </div>
            {hardDeletePreview.deleteGraph?.editionIds?.length ? (
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Editions</div>
                <div className="mt-1 break-all">{hardDeletePreview.deleteGraph.editionIds.join(', ')}</div>
              </div>
            ) : null}
            {hardDeletePreview.deleteGraph?.attachmentIds?.length ? (
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Attachments</div>
                <div className="mt-1 break-all">{hardDeletePreview.deleteGraph.attachmentIds.join(', ')}</div>
              </div>
            ) : null}
            {hardDeleteCountEntries.length ? (
              <div className="grid gap-3 md:grid-cols-3">
                {hardDeleteCountEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300"
                  >
                    <div className="text-xs uppercase tracking-wide text-slate-500">{key}</div>
                    <div>{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                No linked records were found for this ID.
              </div>
            )}
            {hardDeletePreview.deleteGraph?.touchedCollections?.length ? (
              <div className="text-xs text-slate-400">
                Collections: {hardDeletePreview.deleteGraph.touchedCollections.join(', ')}
              </div>
            ) : null}
            <div className="pt-2">
              <Button
                variant="secondary"
                onClick={() => confirmHardDeleteMutation.mutate(hardDeletePreview)}
                disabled={
                  confirmHardDeleteMutation.status === 'pending' ||
                  hardDeletePreview.resolved !== true
                }
              >
                Hard Delete Everywhere
              </Button>
            </div>
          </div>
        ) : null}
      </GlassCard>

      <GlassCard className="!p-5 space-y-4">
        <div>
          <BilingualText role="H2" className="!text-lg">
            Delete All Books (Development Only)
          </BilingualText>
          <p className="mt-2 text-sm text-slate-400">
            Type <span className="font-mono">DELETE ALL BOOKS</span> to clear catalog-linked book authority.
          </p>
        </div>
        <InputField
          id="delete-all-books-confirmation"
          label="Confirmation"
          value={deleteAllConfirmation}
          onChange={(event) => setDeleteAllConfirmation(event.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => deleteAllMutation.mutate(deleteAllConfirmation)}
          disabled={
            deleteAllMutation.status === 'pending' ||
            deleteAllConfirmation.trim() !== 'DELETE ALL BOOKS'
          }
        >
          Delete All Books
        </Button>
      </GlassCard>
    </div>
  );
};

const AuthorsPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('all');
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AuthorDraft>(emptyAuthorDraft());
  const [importQuery, setImportQuery] = useState('');
  const [authorBulkResults, setAuthorBulkResults] = useState<BulkResult[]>([]);

  const { data: authors = [], isLoading } = useQuery<AdminAuthorRecord[]>({
    queryKey: adminServiceQueryKeys.authors({
      query: searchQuery || null,
      status: statusFilter,
      limit: 30,
    }),
    queryFn: () =>
      adminService.listAuthors({
        ...(searchQuery.trim() ? { query: searchQuery.trim() } : {}),
        status: statusFilter,
        limit: 30,
      }),
  });

  const { data: selectedAuthor, isLoading: isAuthorLoading } = useQuery<AdminAuthorRecord>({
    queryKey: adminServiceQueryKeys.author(selectedAuthorId),
    queryFn: () => adminService.getAuthor(selectedAuthorId!),
    enabled: !!selectedAuthorId,
  });

  useEffect(() => {
    if (!selectedAuthorId && authors.length > 0) {
      setSelectedAuthorId(authors[0].authorId);
    }
  }, [authors, selectedAuthorId]);

  useEffect(() => {
    if (selectedAuthor) {
      setDraft(buildAuthorDraft(selectedAuthor));
    }
  }, [selectedAuthor]);

  const saveMutation = useMutation({
    mutationFn: async (nextDraft: AuthorDraft) => {
      const payload = {
        canonicalName: nextDraft.canonicalName,
        ...(nextDraft.displayName ? { displayName: nextDraft.displayName } : {}),
        aliases: splitList(nextDraft.aliases),
        ...(nextDraft.birthDate ? { birthDate: nextDraft.birthDate } : {}),
        ...(nextDraft.deathDate ? { deathDate: nextDraft.deathDate } : {}),
        ...(nextDraft.birthPlace ? { birthPlace: nextDraft.birthPlace } : {}),
        ...(nextDraft.deathPlace ? { deathPlace: nextDraft.deathPlace } : {}),
        ...(nextDraft.nationality ? { nationality: nextDraft.nationality } : {}),
        languages: splitList(nextDraft.languages),
        genres: splitList(nextDraft.genres),
        movements: splitList(nextDraft.movements),
        ...(nextDraft.period ? { period: nextDraft.period } : {}),
        themes: splitList(nextDraft.themes),
        influenceTags: splitList(nextDraft.influenceTags),
        ...(nextDraft.shortBio ? { shortBio: nextDraft.shortBio } : {}),
        ...(nextDraft.fullBio ? { fullBio: nextDraft.fullBio } : {}),
        ...(nextDraft.wikipediaUrl ? { wikipediaUrl: nextDraft.wikipediaUrl } : {}),
        ...(nextDraft.goodreadsId ? { goodreadsId: nextDraft.goodreadsId } : {}),
        ...(nextDraft.openLibraryId ? { openLibraryId: nextDraft.openLibraryId } : {}),
        ...(nextDraft.wikidataId ? { wikidataId: nextDraft.wikidataId } : {}),
        ...(nextDraft.isni ? { isni: nextDraft.isni } : {}),
        ...(nextDraft.viaf ? { viaf: nextDraft.viaf } : {}),
        ...(nextDraft.portraitUrl ? { portraitUrl: nextDraft.portraitUrl } : {}),
        gallery: splitList(nextDraft.gallery),
        knownWorks: splitList(nextDraft.knownWorks),
        bookIds: splitList(nextDraft.bookIds),
        status: nextDraft.status,
        ...(nextDraft.source ? { source: nextDraft.source } : {}),
        ...(nextDraft.primarySource ? { primarySource: nextDraft.primarySource } : {}),
      };

      if (nextDraft.authorId) {
        return adminService.updateAuthor({
          authorId: nextDraft.authorId,
          ...payload,
        });
      }

      return adminService.createAuthor(payload);
    },
    onSuccess: (result) => {
      setSelectedAuthorId(result.author.authorId);
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.authors() as unknown as readonly unknown[] });
      queryClient.setQueryData(adminServiceQueryKeys.author(result.author.authorId), result.author);
      setDraft(buildAuthorDraft(result.author));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (authorId: string) => adminService.archiveAuthor(authorId),
    onSuccess: (author) => {
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.authors() as unknown as readonly unknown[] });
      queryClient.setQueryData(adminServiceQueryKeys.author(author.authorId), author);
      setDraft(buildAuthorDraft(author));
    },
  });

  const { data: importCandidates = [], isLoading: isImportLoading } = useQuery<AdminAuthorImportCandidate[]>({
    queryKey: ['admin', 'authors', 'discover', importQuery.trim() || null],
    queryFn: () => adminService.discoverAuthorCandidates(importQuery.trim(), 8),
    enabled: importQuery.trim().length > 0,
  });

  const importMutation = useMutation({
    mutationFn: (candidate: AdminAuthorImportCandidate) => {
      if (!candidate.providerSource || !candidate.providerExternalId) {
        throw new Error('Candidate is missing provider metadata.');
      }
      return adminService.importAuthorCandidate({
        source: candidate.providerSource,
        providerExternalId: candidate.providerExternalId,
        rawAuthor: candidate as unknown as Record<string, unknown>,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.authors() as unknown as readonly unknown[] });
      setSelectedAuthorId(result.authorId);
    },
  });

  const handleAuthorCsvUpload = async (file: File) => {
    const rows = parseCsv(await file.text()).slice(0, 100);
    const results: BulkResult[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        if (row.source && row.providerexternalid) {
          const providerSource =
            row.source === 'wikidata' ? 'wikidata' : 'openLibrary';
          await adminService.importAuthorCandidate({
            source: providerSource,
            providerExternalId: row.providerexternalid,
            rawAuthor: row,
          });
          results.push({ row: index + 1, status: 'imported', message: 'Imported through canonical provider ingest.' });
          continue;
        }

        const response = await adminService.createAuthor({
          canonicalName: row.canonicalname || row.displayname || '',
          displayName: row.displayname || undefined,
          aliases: splitList(row.aliases || ''),
          birthDate: row.birthdate || undefined,
          deathDate: row.deathdate || undefined,
          birthPlace: row.birthplace || undefined,
          deathPlace: row.deathplace || undefined,
          nationality: row.nationality || undefined,
          languages: splitList(row.languages || ''),
          genres: splitList(row.genres || ''),
          movements: splitList(row.movements || ''),
          period: row.period || undefined,
          themes: splitList(row.themes || ''),
          influenceTags: splitList(row.influencetags || ''),
          shortBio: row.shortbio || undefined,
          fullBio: row.fullbio || undefined,
          wikipediaUrl: row.wikipediaurl || undefined,
          goodreadsId: row.goodreadsid || undefined,
          openLibraryId: row.openlibraryid || undefined,
          wikidataId: row.wikidataid || undefined,
          isni: row.isni || undefined,
          viaf: row.viaf || undefined,
          portraitUrl: row.portraiturl || undefined,
          gallery: splitList(row.gallery || ''),
          knownWorks: splitList(row.knownworks || ''),
          bookIds: splitList(row.bookids || ''),
          status: row.status === 'archived' ? 'archived' : 'active',
          source: row.source || 'admin_csv',
          primarySource: row.primarysource || 'manual',
        });
        results.push({
          row: index + 1,
          status: response.status === 'MERGED' ? 'duplicate' : 'created',
          message: `Saved author ${response.author.canonicalName}.`,
        });
      } catch (error) {
        results.push({
          row: index + 1,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown author import error.',
        });
      }
    }

    setAuthorBulkResults(results);
    await queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.authors() as unknown as readonly unknown[] });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <GlassCard className="!p-4 space-y-4">
          <BilingualText role="H1" className="!text-xl">
            Authors Authority
          </BilingualText>
          <InputField id="authors-search" label="Search authors" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          <SelectField
            id="authors-status"
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as 'active' | 'archived' | 'all')}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <Button variant="secondary" onClick={() => { setSelectedAuthorId(null); setDraft(emptyAuthorDraft()); }}>
            New Author
          </Button>
          <div className="space-y-2 max-h-[32rem] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : authors.length === 0 ? (
              <p className="text-sm text-slate-400">No authors found.</p>
            ) : (
              authors.map((author) => (
                <button
                  key={author.authorId}
                  onClick={() => setSelectedAuthorId(author.authorId)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                    selectedAuthorId === author.authorId ? 'border-primary bg-primary/10' : 'border-white/10 bg-black/10 hover:bg-white/5'
                  )}
                >
                  <div className="font-semibold text-white">{author.canonicalName}</div>
                  <div className="text-xs text-slate-400">{author.status.toUpperCase()}</div>
                </button>
              ))
            )}
          </div>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="!p-5 space-y-4">
            <div className="flex items-center justify-between">
              <BilingualText role="H2" className="!text-lg">
                Author Detail
              </BilingualText>
              {draft.authorId ? (
                <Button
                  variant="ghost"
                  className="!text-red-300"
                  onClick={() => archiveMutation.mutate(draft.authorId!)}
                  disabled={archiveMutation.isPending}
                >
                  Archive
                </Button>
              ) : null}
            </div>
            {isAuthorLoading ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <InputField id="author-canonical-name" label="Canonical name" value={draft.canonicalName} onChange={(event) => setDraft((current) => ({ ...current, canonicalName: event.target.value }))} />
                <InputField id="author-display-name" label="Display name" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} />
                <InputField id="author-aliases" label="Aliases" value={draft.aliases} onChange={(event) => setDraft((current) => ({ ...current, aliases: event.target.value }))} />
                <InputField id="author-birth-date" label="Birth date" value={draft.birthDate} onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value }))} />
                <InputField id="author-death-date" label="Death date" value={draft.deathDate} onChange={(event) => setDraft((current) => ({ ...current, deathDate: event.target.value }))} />
                <InputField id="author-birth-place" label="Birth place" value={draft.birthPlace} onChange={(event) => setDraft((current) => ({ ...current, birthPlace: event.target.value }))} />
                <InputField id="author-death-place" label="Death place" value={draft.deathPlace} onChange={(event) => setDraft((current) => ({ ...current, deathPlace: event.target.value }))} />
                <InputField id="author-nationality" label="Nationality" value={draft.nationality} onChange={(event) => setDraft((current) => ({ ...current, nationality: event.target.value }))} />
                <InputField id="author-languages" label="Languages" value={draft.languages} onChange={(event) => setDraft((current) => ({ ...current, languages: event.target.value }))} />
                <InputField id="author-genres" label="Genres" value={draft.genres} onChange={(event) => setDraft((current) => ({ ...current, genres: event.target.value }))} />
                <InputField id="author-movements" label="Movements" value={draft.movements} onChange={(event) => setDraft((current) => ({ ...current, movements: event.target.value }))} />
                <InputField id="author-period" label="Period" value={draft.period} onChange={(event) => setDraft((current) => ({ ...current, period: event.target.value }))} />
                <InputField id="author-themes" label="Themes" value={draft.themes} onChange={(event) => setDraft((current) => ({ ...current, themes: event.target.value }))} />
                <InputField id="author-influence-tags" label="Influence tags" value={draft.influenceTags} onChange={(event) => setDraft((current) => ({ ...current, influenceTags: event.target.value }))} />
                <InputField id="author-wikipedia" label="Wikipedia URL" value={draft.wikipediaUrl} onChange={(event) => setDraft((current) => ({ ...current, wikipediaUrl: event.target.value }))} />
                <InputField id="author-goodreads" label="Goodreads ID" value={draft.goodreadsId} onChange={(event) => setDraft((current) => ({ ...current, goodreadsId: event.target.value }))} />
                <InputField id="author-openlibrary" label="OpenLibrary ID" value={draft.openLibraryId} onChange={(event) => setDraft((current) => ({ ...current, openLibraryId: event.target.value }))} />
                <InputField id="author-wikidata" label="Wikidata ID" value={draft.wikidataId} onChange={(event) => setDraft((current) => ({ ...current, wikidataId: event.target.value }))} />
                <InputField id="author-isni" label="ISNI" value={draft.isni} onChange={(event) => setDraft((current) => ({ ...current, isni: event.target.value }))} />
                <InputField id="author-viaf" label="VIAF" value={draft.viaf} onChange={(event) => setDraft((current) => ({ ...current, viaf: event.target.value }))} />
                <InputField id="author-portrait" label="Portrait URL" value={draft.portraitUrl} onChange={(event) => setDraft((current) => ({ ...current, portraitUrl: event.target.value }))} />
                <InputField id="author-gallery" label="Gallery URLs" value={draft.gallery} onChange={(event) => setDraft((current) => ({ ...current, gallery: event.target.value }))} />
                <InputField id="author-known-works" label="Known works" value={draft.knownWorks} onChange={(event) => setDraft((current) => ({ ...current, knownWorks: event.target.value }))} />
                <InputField id="author-book-ids" label="Book IDs" value={draft.bookIds} onChange={(event) => setDraft((current) => ({ ...current, bookIds: event.target.value }))} />
                <InputField id="author-source" label="Source" value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} />
                <InputField id="author-primary-source" label="Primary source" value={draft.primarySource} onChange={(event) => setDraft((current) => ({ ...current, primarySource: event.target.value }))} />
                <SelectField
                  id="author-status"
                  label="Status"
                  value={draft.status}
                  onChange={(value) => setDraft((current) => ({ ...current, status: value as 'active' | 'archived' }))}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
                <TextAreaField id="author-short-bio" label="Short bio" value={draft.shortBio} onChange={(value) => setDraft((current) => ({ ...current, shortBio: value }))} rows={3} />
                <div className="md:col-span-2">
                  <TextAreaField id="author-full-bio" label="Full bio" value={draft.fullBio} onChange={(value) => setDraft((current) => ({ ...current, fullBio: value }))} rows={6} />
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending}>
                {draft.authorId ? 'Save Changes' : 'Create Author'}
              </Button>
              <Button variant="secondary" onClick={() => setDraft(emptyAuthorDraft())}>
                Reset
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="!p-5 space-y-4">
            <BilingualText role="H2" className="!text-lg">Search Online and Import</BilingualText>
            <InputField id="author-import-query" label="Provider search" value={importQuery} onChange={(event) => setImportQuery(event.target.value)} />
            <div className="space-y-2">
              {isImportLoading ? (
                <div className="flex justify-center py-6"><LoadingSpinner /></div>
              ) : importCandidates.length === 0 ? (
                <p className="text-sm text-slate-400">Search OpenLibrary/Wikidata candidates and import through canonical ingestion.</p>
              ) : (
                importCandidates.map((candidate) => (
                  <div key={`${candidate.providerSource || 'local'}:${candidate.id}`} className="rounded-lg border border-white/10 bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-white">{candidate.nameEn}</div>
                        <div className="text-xs text-slate-400">{candidate.providerSource || 'local'} {candidate.providerExternalId || ''}</div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => importMutation.mutate(candidate)}
                        disabled={importMutation.isPending || !candidate.providerSource || !candidate.providerExternalId}
                      >
                        Import
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

          <GlassCard className="!p-5 space-y-4">
            <BilingualText role="H2" className="!text-lg">Bulk Upload</BilingualText>
            <input
              type="file"
              accept=".csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleAuthorCsvUpload(file);
                }
              }}
              className="block w-full text-sm text-slate-300"
            />
            <p className="text-xs text-slate-500">
              Accepted headers: `canonicalName`, `displayName`, `aliases`, `birthDate`, `source`, `providerExternalId`, and other form field names.
            </p>
            {authorBulkResults.length > 0 ? (
              <div className="space-y-2">
                {authorBulkResults.map((result) => (
                  <div key={`author-bulk-${result.row}`} className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                    Row {result.row}: {result.status.toUpperCase()} - {result.message}
                  </div>
                ))}
              </div>
            ) : null}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

const QuotesPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('all');
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuoteDraft>(emptyQuoteDraft());
  const [quoteImportMessage, setQuoteImportMessage] = useState('');

  const { data: quotes = [], isLoading } = useQuery<AdminQuoteRecord[]>({
    queryKey: adminServiceQueryKeys.quotes({
      query: searchQuery || null,
      status: statusFilter,
      limit: 30,
    }),
    queryFn: () =>
      adminService.listQuotes({
        ...(searchQuery.trim() ? { query: searchQuery.trim() } : {}),
        status: statusFilter,
        limit: 30,
      }),
  });

  const { data: selectedQuote, isLoading: isQuoteLoading } = useQuery<AdminQuoteRecord>({
    queryKey: adminServiceQueryKeys.quote(selectedQuoteId),
    queryFn: () => adminService.getQuote(selectedQuoteId!),
    enabled: !!selectedQuoteId,
  });

  const { data: quoteImportJob } = useQuery<AdminQuoteImportJob | null>({
    queryKey: adminServiceQueryKeys.quoteImportStatus,
    queryFn: () => adminService.getQuoteImportStatus(),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!selectedQuoteId && quotes.length > 0) {
      setSelectedQuoteId(quotes[0].quoteId);
    }
  }, [quotes, selectedQuoteId]);

  useEffect(() => {
    if (selectedQuote) {
      setDraft(buildQuoteDraft(selectedQuote));
    }
  }, [selectedQuote]);

  const saveMutation = useMutation({
    mutationFn: async (nextDraft: QuoteDraft) => {
      const optionalPayload = {
        ...(nextDraft.authorId ? { authorId: nextDraft.authorId } : {}),
        ...(nextDraft.bookId ? { bookId: nextDraft.bookId } : {}),
        ...(nextDraft.chapter ? { chapter: nextDraft.chapter } : {}),
        ...(nextDraft.page ? { page: Number(nextDraft.page) } : {}),
        ...(nextDraft.section ? { section: nextDraft.section } : {}),
        ...(nextDraft.year ? { year: Number(nextDraft.year) } : {}),
        ...(nextDraft.language ? { language: nextDraft.language } : {}),
        ...(nextDraft.originalLanguage ? { originalLanguage: nextDraft.originalLanguage } : {}),
        ...(nextDraft.translatedFrom ? { translatedFrom: nextDraft.translatedFrom } : {}),
        ...(nextDraft.translationStatus ? { translationStatus: nextDraft.translationStatus } : {}),
        themes: splitList(nextDraft.themes),
        ...(nextDraft.mood ? { mood: nextDraft.mood } : {}),
        concepts: splitList(nextDraft.concepts),
        keywords: splitList(nextDraft.keywords),
        ...(nextDraft.attributionConfidence ? { attributionConfidence: Number(nextDraft.attributionConfidence) } : {}),
        ...(nextDraft.sourceType ? { sourceType: nextDraft.sourceType } : {}),
        ...(nextDraft.sourceReference ? { sourceReference: nextDraft.sourceReference } : {}),
        isPublic: nextDraft.isPublic,
      };

      if (nextDraft.quoteId) {
        return adminService.updateQuote({
          quoteId: nextDraft.quoteId,
          ...(nextDraft.textEn ? { textEn: nextDraft.textEn } : {}),
          ...(nextDraft.textAr ? { textAr: nextDraft.textAr } : {}),
          ...(nextDraft.sourceEn ? { sourceEn: nextDraft.sourceEn } : {}),
          ...(nextDraft.sourceAr ? { sourceAr: nextDraft.sourceAr } : {}),
          ...optionalPayload,
          status: nextDraft.status,
        });
      }
      const textEn = nextDraft.textEn.trim();
      const textAr = nextDraft.textAr.trim();
      const sourceEn = nextDraft.sourceEn.trim();
      const sourceAr = nextDraft.sourceAr.trim();
      if (!textEn || !textAr || !sourceEn || !sourceAr) {
        throw new Error('Quote text and source are required in both languages.');
      }
      const result = await adminService.createQuote({
        textEn,
        textAr,
        sourceEn,
        sourceAr,
        ...optionalPayload,
      });
      return result.quote;
    },
    onSuccess: (quote) => {
      const resolvedQuote = 'quoteId' in quote ? quote : quote;
      setSelectedQuoteId(resolvedQuote.quoteId);
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.quotes() as unknown as readonly unknown[] });
      queryClient.setQueryData(adminServiceQueryKeys.quote(resolvedQuote.quoteId), resolvedQuote);
      setDraft(buildQuoteDraft(resolvedQuote));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (quoteId: string) => adminService.archiveQuote(quoteId),
    onSuccess: async () => {
      if (selectedQuoteId) {
        await queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.quote(selectedQuoteId) });
      }
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.quotes() as unknown as readonly unknown[] });
    },
  });

  const quoteImportMutation = useMutation({
    mutationFn: async (file: File) => adminService.uploadQuoteImportFile(file),
    onSuccess: async () => {
      setQuoteImportMessage('Import registered. Daily ingestion is now server-owned.');
      await queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.quoteImportStatus });
    },
    onError: (error) => {
      setQuoteImportMessage(error instanceof Error ? error.message : 'Quote import registration failed.');
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <GlassCard className="!p-4 space-y-4">
          <BilingualText role="H1" className="!text-xl">Quotes Authority</BilingualText>
          <InputField id="quotes-search" label="Search quotes" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          <SelectField
            id="quotes-status"
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as 'active' | 'archived' | 'all')}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <Button variant="secondary" onClick={() => { setSelectedQuoteId(null); setDraft(emptyQuoteDraft()); }}>
            New Quote
          </Button>
          <div className="space-y-2 max-h-[32rem] overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : quotes.length === 0 ? (
              <p className="text-sm text-slate-400">No quotes found.</p>
            ) : (
              quotes.map((quote) => (
                <button
                  key={quote.quoteId}
                  onClick={() => setSelectedQuoteId(quote.quoteId)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                    selectedQuoteId === quote.quoteId ? 'border-primary bg-primary/10' : 'border-white/10 bg-black/10 hover:bg-white/5'
                  )}
                >
                  <div className="line-clamp-2 font-semibold text-white">{quote.canonicalText}</div>
                  <div className="text-xs text-slate-400">{quote.status.toUpperCase()}</div>
                </button>
              ))
            )}
          </div>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="!p-5 space-y-4">
            <div className="flex items-center justify-between">
              <BilingualText role="H2" className="!text-lg">Quote Detail</BilingualText>
              {draft.quoteId ? (
                <Button
                  variant="ghost"
                  className="!text-red-300"
                  onClick={() => archiveMutation.mutate(draft.quoteId!)}
                  disabled={archiveMutation.isPending}
                >
                  Archive
                </Button>
              ) : null}
            </div>
            {isQuoteLoading ? (
              <div className="flex justify-center py-8"><LoadingSpinner /></div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <TextAreaField id="quote-text-en" label="Text EN" value={draft.textEn} onChange={(value) => setDraft((current) => ({ ...current, textEn: value }))} rows={4} />
                <TextAreaField id="quote-text-ar" label="Text AR" value={draft.textAr} onChange={(value) => setDraft((current) => ({ ...current, textAr: value }))} rows={4} />
                <InputField id="quote-source-en" label="Source EN" value={draft.sourceEn} onChange={(event) => setDraft((current) => ({ ...current, sourceEn: event.target.value }))} />
                <InputField id="quote-source-ar" label="Source AR" value={draft.sourceAr} onChange={(event) => setDraft((current) => ({ ...current, sourceAr: event.target.value }))} />
                <InputField id="quote-author-id" label="Author ID" value={draft.authorId} onChange={(event) => setDraft((current) => ({ ...current, authorId: event.target.value }))} />
                <InputField id="quote-book-id" label="Book ID" value={draft.bookId} onChange={(event) => setDraft((current) => ({ ...current, bookId: event.target.value }))} />
                <InputField id="quote-chapter" label="Chapter" value={draft.chapter} onChange={(event) => setDraft((current) => ({ ...current, chapter: event.target.value }))} />
                <InputField id="quote-page" label="Page" value={draft.page} onChange={(event) => setDraft((current) => ({ ...current, page: event.target.value }))} />
                <InputField id="quote-section" label="Section" value={draft.section} onChange={(event) => setDraft((current) => ({ ...current, section: event.target.value }))} />
                <InputField id="quote-year" label="Year" value={draft.year} onChange={(event) => setDraft((current) => ({ ...current, year: event.target.value }))} />
                <InputField id="quote-language" label="Language" value={draft.language} onChange={(event) => setDraft((current) => ({ ...current, language: event.target.value }))} />
                <InputField id="quote-original-language" label="Original language" value={draft.originalLanguage} onChange={(event) => setDraft((current) => ({ ...current, originalLanguage: event.target.value }))} />
                <InputField id="quote-translated-from" label="Translated from" value={draft.translatedFrom} onChange={(event) => setDraft((current) => ({ ...current, translatedFrom: event.target.value }))} />
                <InputField id="quote-translation-status" label="Translation status" value={draft.translationStatus} onChange={(event) => setDraft((current) => ({ ...current, translationStatus: event.target.value }))} />
                <InputField id="quote-themes" label="Themes" value={draft.themes} onChange={(event) => setDraft((current) => ({ ...current, themes: event.target.value }))} />
                <InputField id="quote-mood" label="Mood" value={draft.mood} onChange={(event) => setDraft((current) => ({ ...current, mood: event.target.value }))} />
                <InputField id="quote-concepts" label="Concepts" value={draft.concepts} onChange={(event) => setDraft((current) => ({ ...current, concepts: event.target.value }))} />
                <InputField id="quote-keywords" label="Keywords" value={draft.keywords} onChange={(event) => setDraft((current) => ({ ...current, keywords: event.target.value }))} />
                <InputField id="quote-attribution-confidence" label="Attribution confidence" value={draft.attributionConfidence} onChange={(event) => setDraft((current) => ({ ...current, attributionConfidence: event.target.value }))} />
                <InputField id="quote-source-type" label="Source type" value={draft.sourceType} onChange={(event) => setDraft((current) => ({ ...current, sourceType: event.target.value }))} />
                <InputField id="quote-source-reference" label="Source reference" value={draft.sourceReference} onChange={(event) => setDraft((current) => ({ ...current, sourceReference: event.target.value }))} />
                <SelectField
                  id="quote-status"
                  label="Status"
                  value={draft.status}
                  onChange={(value) => setDraft((current) => ({ ...current, status: value as 'active' | 'archived' }))}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
                <SelectField
                  id="quote-visibility"
                  label="Visibility"
                  value={draft.isPublic ? 'public' : 'private'}
                  onChange={(value) => setDraft((current) => ({ ...current, isPublic: value === 'public' }))}
                  options={[
                    { value: 'public', label: 'Public' },
                    { value: 'private', label: 'Private' },
                  ]}
                />
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending}>
                {draft.quoteId ? 'Save Changes' : 'Create Quote'}
              </Button>
              <Button variant="secondary" onClick={() => setDraft(emptyQuoteDraft())}>
                Reset
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="!p-5 space-y-4">
            <BilingualText role="H2" className="!text-lg">Bulk Upload</BilingualText>
            <p className="text-sm text-slate-400">
              Upload the raw Kaggle CSV unchanged. The server registers the file, parses it, and ingests it daily under a fixed write budget.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void quoteImportMutation.mutateAsync(file);
                }
                event.currentTarget.value = '';
              }}
              disabled={quoteImportMutation.isPending}
              className="block w-full text-sm text-slate-300"
            />
            <p className="text-xs text-slate-500">
              Required raw headers: `quote`, `author`, `category`. The server resolves canonical authors, skips unresolved rows, and resumes daily until complete.
            </p>
            {quoteImportMessage ? (
              <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                {quoteImportMessage}
              </div>
            ) : null}
            {quoteImportJob ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                  Status: {quoteImportJob.status.toUpperCase()}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                  File: {quoteImportJob.fileName}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                  Progress: {quoteImportJob.processedRows.toLocaleString()} / {quoteImportJob.totalRows.toLocaleString()} rows
                </div>
                <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                  Created: {quoteImportJob.createdRows.toLocaleString()} | Duplicates: {quoteImportJob.duplicateRows.toLocaleString()} | Skipped: {quoteImportJob.skippedRows.toLocaleString()} | Failed: {quoteImportJob.failedRows.toLocaleString()}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                  Estimated completion: {quoteImportJob.estimatedCompletionDays} day(s)
                </div>
                {quoteImportJob.lastRunAt ? (
                  <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-sm text-slate-300">
                    Last run: {quoteImportJob.lastRunAt}
                  </div>
                ) : null}
                {quoteImportJob.lastError ? (
                  <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    Last error: {quoteImportJob.lastError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

const CatalogAuthorityTab: React.FC = () => {
  const { lang } = useI18n();
  const [activeView, setActiveView] = useState<CatalogSubview>('authors');

  return (
    <div className="space-y-6">
      <div>
        <BilingualText role="H1" className="!text-2xl mb-2">
          {lang === 'en' ? 'Catalog Authority' : 'سلطة الكتالوج'}
        </BilingualText>
        <p className="text-sm text-slate-400">
          {lang === 'en'
            ? 'Superadmin-only authority controls for canonical authors, books, and quotes.'
            : 'ضوابط سلطة المشرف الأعلى للمؤلفين والكتب والاقتباسات المعتمدة.'}
        </p>
      </div>

      <div className="flex gap-2">
        <SubtabButton active={activeView === 'authors'} label={lang === 'en' ? 'Authors' : 'المؤلفون'} onClick={() => setActiveView('authors')} />
        <SubtabButton active={activeView === 'books'} label={lang === 'en' ? 'Books' : 'الكتب'} onClick={() => setActiveView('books')} />
        <SubtabButton active={activeView === 'quotes'} label={lang === 'en' ? 'Quotes' : 'الاقتباسات'} onClick={() => setActiveView('quotes')} />
      </div>

      {activeView === 'authors' ? <AuthorsPanel /> : activeView === 'books' ? <BooksPanel /> : <QuotesPanel />}
    </div>
  );
};

export default CatalogAuthorityTab;
