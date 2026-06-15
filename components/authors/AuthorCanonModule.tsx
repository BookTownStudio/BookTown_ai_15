import React from "react";
import type { Book } from "../../types/entities.ts";
import type { AuthorCanonModel } from "../../lib/authors/authorCanon.ts";
import { formatPublicationLabel } from "../../lib/authors/authorCanon.ts";
import BilingualText from "../ui/BilingualText.tsx";
import LoadingSpinner from "../ui/LoadingSpinner.tsx";
import BookCard from "../content/BookCard.tsx";

interface AuthorCanonModuleProps {
  readonly canon: AuthorCanonModel;
  readonly isLoading: boolean;
  readonly hasMore: boolean;
  readonly totalCanonicalCount: number;
  readonly repairWorksCount: number;
  readonly bibliographyAuthority: string;
  readonly lang: "en" | "ar";
  readonly onBookClick: (bookId: string) => void;
  readonly onViewAll: () => void;
}

const BookRail: React.FC<{
  readonly books: readonly Book[];
  readonly onBookClick: (bookId: string) => void;
}> = ({ books, onBookClick }) => (
  <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
    {books.map((book) => (
      <button
        key={book.id}
        type="button"
        onClick={() => onBookClick(book.id)}
        className="shrink-0 text-left"
      >
        <BookCard bookId={book.id} layout="list" />
      </button>
    ))}
  </div>
);

const EmptyState: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.03] px-4 py-5 text-white/60">
    <BilingualText role="Caption">{children}</BilingualText>
  </div>
);

const AuthorCanonModule: React.FC<AuthorCanonModuleProps> = ({
  canon,
  isLoading,
  hasMore,
  totalCanonicalCount,
  repairWorksCount,
  bibliographyAuthority,
  lang,
  onBookClick,
  onViewAll,
}) => {
  const hasCanon = canon.completeBibliography.length > 0;

  return (
    <section className="border-t border-white/10 pt-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <BilingualText role="H1" className="!text-xl">
            {lang === "en" ? "Author Canon" : "قانون المؤلف الأدبي"}
          </BilingualText>
          <BilingualText role="Caption" className="mt-1 text-white/50">
            {lang === "en"
              ? `${totalCanonicalCount} canonical works`
              : `${totalCanonicalCount} أعمال قانونية`}
          </BilingualText>
        </div>
        {hasMore || hasCanon ? (
          <button type="button" onClick={onViewAll} className="shrink-0 text-sm font-semibold text-accent">
            {lang === "en" ? "Complete Bibliography" : "القائمة الكاملة"}
          </button>
        ) : null}
      </div>

      <span className="sr-only">
        {`Bibliography authority: ${bibliographyAuthority}; canonical works: ${totalCanonicalCount}; repair works: ${repairWorksCount}; repair works excluded from canon: ${repairWorksCount}`}
      </span>

      {isLoading ? (
        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] py-8">
          <LoadingSpinner />
          <BilingualText role="Caption" className="text-white/50">
            {lang === "en" ? "Loading canonical bibliography..." : "جاري تحميل القانون الأدبي..."}
          </BilingualText>
        </div>
      ) : !hasCanon ? (
        <EmptyState>
          {lang === "en"
            ? "No canonical works are attached to this author yet."
            : "لا توجد أعمال قانونية مرتبطة بهذا المؤلف بعد."}
        </EmptyState>
      ) : (
        <div className="space-y-7">
          <div>
            <BilingualText role="Caption" className="mb-3 text-accent">
              {lang === "en" ? "Start Here" : "ابدأ هنا"}
            </BilingualText>
            <BookRail books={canon.startHere} onBookClick={onBookClick} />
          </div>

          {canon.majorWorks.length > 0 ? (
            <div>
              <BilingualText role="Caption" className="mb-3 text-white/55">
                {lang === "en" ? "Major Works" : "الأعمال الكبرى"}
              </BilingualText>
              <BookRail books={canon.majorWorks} onBookClick={onBookClick} />
            </div>
          ) : null}

          <div>
            <BilingualText role="Caption" className="mb-3 text-white/55">
              {lang === "en" ? "Publication Chronology" : "التسلسل الزمني للنشر"}
            </BilingualText>
            <ol className="grid gap-2 sm:grid-cols-2">
              {canon.publicationChronology.slice(0, 8).map((book) => (
                <li key={book.id}>
                  <button
                    type="button"
                    onClick={() => onBookClick(book.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/75 hover:bg-white/[0.07]"
                  >
                    <span className="min-w-0 truncate">{lang === "en" ? book.titleEn : book.titleAr}</span>
                    <span className="shrink-0 text-white/45">{formatPublicationLabel(book)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
};

export default AuthorCanonModule;
