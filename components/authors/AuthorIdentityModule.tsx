import React, { useMemo, useState } from "react";
import type { Author } from "../../types/entities.ts";
import BilingualText from "../ui/BilingualText.tsx";
import { PlusIcon } from "../icons/PlusIcon.tsx";
import { ShareIcon } from "../icons/ShareIcon.tsx";
import { BookOpenIcon } from "../icons/BookOpenIcon.tsx";
import { QuoteIcon } from "../icons/QuoteIcon.tsx";

function shortIntroduction(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const sentenceEnd = normalized.search(/[.!?؟۔]\s/);
  const firstSentence = sentenceEnd > 0 ? normalized.slice(0, sentenceEnd + 1) : normalized;
  return firstSentence.length > 260 ? `${firstSentence.slice(0, 257).trim()}...` : firstSentence;
}

export interface AuthorIdentityModuleProps {
  readonly author: Author;
  readonly lang: "en" | "ar";
  readonly isRTL: boolean;
  readonly worksCount: number;
  readonly quotesCount: number;
  readonly isFollowed: boolean;
  readonly isFollowActionPending: boolean;
  readonly onFollow: (event: React.MouseEvent) => void;
  readonly onShare: (event: React.MouseEvent) => void;
  readonly onViewBooks: (event: React.MouseEvent) => void;
  readonly onViewQuotes: (event: React.MouseEvent) => void;
}

const AuthorIdentityModule: React.FC<AuthorIdentityModuleProps> = ({
  author,
  lang,
  isRTL,
  worksCount,
  quotesCount,
  isFollowed,
  isFollowActionPending,
  onFollow,
  onShare,
  onViewBooks,
  onViewQuotes,
}) => {
  const [isBioExpanded, setBioExpanded] = useState(false);
  const bio = lang === "en" ? author.bioEn : author.bioAr;
  const introduction = useMemo(() => shortIntroduction(bio), [bio]);
  const primaryLanguage = lang === "en" ? author.languageEn : author.languageAr;

  return (
    <section className="border-b border-white/10 pb-8">
      <div className={`grid gap-7 lg:grid-cols-[240px_minmax(0,1fr)] ${isRTL ? "lg:[direction:rtl]" : ""}`}>
        <div className="relative h-72 w-full max-w-64 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] shadow-[0_24px_70px_rgba(2,8,23,0.42)]">
          <img
            src={author.avatarUrl}
            alt={lang === "en" ? author.nameEn : author.nameAr}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0">
          <BilingualText role="Caption" className="text-accent">
            {lang === "en" ? "Literary Identity" : "هوية أدبية"}
          </BilingualText>
          <BilingualText role="H1" className="mt-2 !text-5xl leading-tight">
            {lang === "en" ? author.nameEn : author.nameAr}
          </BilingualText>

          <div className="mt-4 grid gap-3 text-sm text-white/65 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="block text-white/40">{lang === "en" ? "Life" : "الحياة"}</span>
              <span>{author.lifespan || "-"}</span>
            </div>
            <div>
              <span className="block text-white/40">{lang === "en" ? "Nationality" : "الجنسية"}</span>
              <span>{lang === "en" ? author.countryEn : author.countryAr}</span>
            </div>
            <div>
              <span className="block text-white/40">{lang === "en" ? "Primary Language" : "اللغة الرئيسية"}</span>
              <span>{primaryLanguage || "-"}</span>
            </div>
            <div>
              <span className="block text-white/40">{lang === "en" ? "Canon" : "القانون الأدبي"}</span>
              <span>
                {worksCount} {lang === "en" ? "works" : "عمل"} / {quotesCount}{" "}
                {lang === "en" ? "quotes" : "اقتباس"}
              </span>
            </div>
          </div>

          {introduction ? (
            <BilingualText role="Body" className="mt-5 max-w-3xl text-white/78 leading-7">
              {introduction}
            </BilingualText>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onFollow}
              aria-label={isFollowed ? "Unfollow Author" : "Follow Author"}
              disabled={isFollowActionPending}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 ${
                isFollowed
                  ? "border-accent/50 bg-accent/15 text-white"
                  : "border-white/10 bg-white/[0.06] text-white/85 hover:bg-white/[0.1]"
              }`}
            >
              <PlusIcon className="h-4 w-4" />
              {isFollowActionPending
                ? lang === "en" ? "Updating" : "جارٍ التحديث"
                : isFollowed
                  ? lang === "en" ? "Following" : "تتابعه"
                  : lang === "en" ? "Follow" : "متابعة"}
              {isFollowed && !isFollowActionPending ? (
                <span className="text-xs font-normal text-white/55">
                  {lang === "en" ? "Tap to unfollow" : "اضغط للإلغاء"}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={onShare}
              aria-label="Share Author"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <ShareIcon className="h-4 w-4" />
              {lang === "en" ? "Share" : "مشاركة"}
            </button>
            <button
              type="button"
              onClick={onViewBooks}
              aria-label="View Books"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <BookOpenIcon className="h-4 w-4" />
              {lang === "en" ? "View Books" : "عرض الكتب"}
            </button>
            <button
              type="button"
              onClick={onViewQuotes}
              aria-label="View Quotes"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <QuoteIcon className="h-4 w-4" />
              {lang === "en" ? "View Quotes" : "عرض الاقتباسات"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-7 max-w-4xl">
        <BilingualText role="Caption" className="mb-2 text-white/45">
          {lang === "en" ? "Biography" : "السيرة الذاتية"}
        </BilingualText>
        <BilingualText role="Body" className={`text-white/72 leading-7 ${!isBioExpanded ? "line-clamp-4" : ""}`}>
          {bio}
        </BilingualText>
        {!isBioExpanded && bio.length > introduction.length ? (
          <button
            type="button"
            onClick={() => setBioExpanded(true)}
            className="mt-2 text-sm font-semibold text-accent"
          >
            {lang === "en" ? "Read more" : "قراءة المزيد"}
          </button>
        ) : null}
      </div>
    </section>
  );
};

export default AuthorIdentityModule;
