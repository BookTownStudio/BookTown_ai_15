import React from "react";
import type { Quote } from "../../types/entities.ts";
import BilingualText from "../ui/BilingualText.tsx";
import LoadingSpinner from "../ui/LoadingSpinner.tsx";
import QuoteSnippetCard from "../content/QuoteSnippetCard.tsx";
import { BookmarkIcon } from "../icons/BookmarkIcon.tsx";
import { ShareIcon } from "../icons/ShareIcon.tsx";

interface AuthorVoiceModuleProps {
  readonly quotes: readonly Quote[];
  readonly isLoading: boolean;
  readonly lang: "en" | "ar";
  readonly onViewAll: () => void;
  readonly onQuoteClick: (quoteId: string) => void;
  readonly onQuoteSourceClick: (event: React.MouseEvent, bookId: string) => void;
  readonly onSaveQuote: (quoteId: string) => void;
  readonly onShareQuote: (quoteId: string) => void;
}

const AuthorVoiceModule: React.FC<AuthorVoiceModuleProps> = ({
  quotes,
  isLoading,
  lang,
  onViewAll,
  onQuoteClick,
  onQuoteSourceClick,
  onSaveQuote,
  onShareQuote,
}) => {
  return (
    <section className="border-t border-white/10 pt-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <BilingualText role="H1" className="!text-xl">
            {lang === "en" ? "Author Voice" : "صوت المؤلف"}
          </BilingualText>
          <BilingualText role="Caption" className="mt-1 text-white/50">
            {lang === "en"
              ? "Canonical public quotations from the quote catalog."
              : "اقتباسات عامة قانونية من كتالوج الاقتباسات."}
          </BilingualText>
        </div>
        {quotes.length > 0 ? (
          <button type="button" onClick={onViewAll} className="shrink-0 text-sm font-semibold text-accent">
            {lang === "en" ? "View all" : "عرض الكل"}
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex w-full flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] py-8">
          <LoadingSpinner />
          <BilingualText role="Caption" className="text-white/50">
            {lang === "en" ? "Loading public quotes..." : "جاري تحميل الاقتباسات العامة..."}
          </BilingualText>
        </div>
      ) : quotes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {quotes.map((quote) => {
            const sourceTitle = lang === "en" ? quote.sourceEn : quote.sourceAr;
            return (
              <div key={quote.id} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                <button
                  type="button"
                  onClick={() => onQuoteClick(quote.id)}
                  aria-label={lang === "en" ? "Open quote details" : "فتح تفاصيل الاقتباس"}
                  className="w-full text-left"
                >
                  <QuoteSnippetCard quote={quote} />
                </button>
                <div className="flex flex-wrap items-center gap-3 px-2 pb-1">
                  {quote.bookId && sourceTitle ? (
                    <button
                      type="button"
                      onClick={(event) => onQuoteSourceClick(event, quote.bookId)}
                      className="text-sm font-medium text-accent"
                    >
                      {lang === "en" ? `Open ${sourceTitle}` : `فتح ${sourceTitle}`}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSaveQuote(quote.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white/65 hover:text-white"
                  >
                    <BookmarkIcon className="h-4 w-4" />
                    {lang === "en" ? "Save" : "حفظ"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onShareQuote(quote.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-white/65 hover:text-white"
                  >
                    <ShareIcon className="h-4 w-4" />
                    {lang === "en" ? "Share" : "مشاركة"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.03] px-4 py-5">
          <BilingualText role="Caption" className="text-white/60">
            {lang === "en"
              ? "No public quotes are attached to this author yet."
              : "لا توجد اقتباسات عامة مرتبطة بهذا المؤلف بعد."}
          </BilingualText>
        </div>
      )}
    </section>
  );
};

export default AuthorVoiceModule;
