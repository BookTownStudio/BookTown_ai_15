import React from "react";
import type { AuthorReaderMemoryModel } from "../../lib/hooks/useAuthorReaderMemory.ts";
import BilingualText from "../ui/BilingualText.tsx";
import LoadingSpinner from "../ui/LoadingSpinner.tsx";
import { BookIcon } from "../icons/BookIcon.tsx";
import { QuoteIcon } from "../icons/QuoteIcon.tsx";
import { StarIcon } from "../icons/StarIcon.tsx";
import { PlusIcon } from "../icons/PlusIcon.tsx";

interface AuthorReaderMemoryModuleProps {
  readonly memory: AuthorReaderMemoryModel | undefined;
  readonly isLoading: boolean;
  readonly lang: "en" | "ar";
}

const metricClass =
  "rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-left";

const AuthorReaderMemoryModule: React.FC<AuthorReaderMemoryModuleProps> = ({
  memory,
  isLoading,
  lang,
}) => {
  if (isLoading) {
    return (
      <section className="border-t border-white/10 pt-8">
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-5">
          <LoadingSpinner />
          <BilingualText role="Caption" className="text-white/55">
            {lang === "en" ? "Loading your author memory..." : "جاري تحميل ذاكرتك مع المؤلف..."}
          </BilingualText>
        </div>
      </section>
    );
  }

  const model =
    memory ?? {
      isSignedIn: false,
      isFollowed: false,
      booksRead: [],
      currentlyReading: [],
      savedQuotes: [],
      reviews: [],
      continuation: { book: null, reason: "none" as const, label: "No continuation available" },
    };

  return (
    <section className="border-t border-white/10 pt-8">
      <div className="mb-5">
        <BilingualText role="H1" className="!text-xl">
          {lang === "en" ? "Reader Memory" : "ذاكرة القارئ"}
        </BilingualText>
        <BilingualText role="Caption" className="mt-1 text-white/50">
          {lang === "en"
            ? "Your canonical interactions with this author."
            : "تفاعلاتك القانونية مع هذا المؤلف."}
        </BilingualText>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className={metricClass}>
          <PlusIcon className="mb-2 h-4 w-4 text-accent" />
          <BilingualText role="Caption" className="text-white/45">
            {lang === "en" ? "Follow" : "المتابعة"}
          </BilingualText>
          <BilingualText role="H2" className="mt-1 !text-base">
            {model.isFollowed ? (lang === "en" ? "Following" : "تتابعه") : lang === "en" ? "Not yet" : "ليس بعد"}
          </BilingualText>
        </div>
        <div className={metricClass}>
          <BookIcon className="mb-2 h-4 w-4 text-accent" />
          <BilingualText role="Caption" className="text-white/45">
            {lang === "en" ? "Read" : "مقروءة"}
          </BilingualText>
          <BilingualText role="H2" className="mt-1 !text-base">
            {model.booksRead.length}
          </BilingualText>
        </div>
        <div className={metricClass}>
          <BookIcon className="mb-2 h-4 w-4 text-accent" />
          <BilingualText role="Caption" className="text-white/45">
            {lang === "en" ? "Reading" : "قيد القراءة"}
          </BilingualText>
          <BilingualText role="H2" className="mt-1 !text-base">
            {model.currentlyReading.length}
          </BilingualText>
        </div>
        <div className={metricClass}>
          <QuoteIcon className="mb-2 h-4 w-4 text-accent" />
          <BilingualText role="Caption" className="text-white/45">
            {lang === "en" ? "Saved Quotes" : "اقتباسات محفوظة"}
          </BilingualText>
          <BilingualText role="H2" className="mt-1 !text-base">
            {model.savedQuotes.length}
          </BilingualText>
        </div>
        <div className={metricClass}>
          <StarIcon className="mb-2 h-4 w-4 text-accent" />
          <BilingualText role="Caption" className="text-white/45">
            {lang === "en" ? "Reviews" : "مراجعات"}
          </BilingualText>
          <BilingualText role="H2" className="mt-1 !text-base">
            {model.reviews.length}
          </BilingualText>
        </div>
      </div>

      {!model.isSignedIn ? (
        <BilingualText role="Caption" className="mt-3 block text-white/45">
          {lang === "en"
            ? "Sign in to see reading progress, saved quotes, and reviews for this author."
            : "سجّل الدخول لرؤية تقدم القراءة والاقتباسات المحفوظة والمراجعات لهذا المؤلف."}
        </BilingualText>
      ) : null}
    </section>
  );
};

export default AuthorReaderMemoryModule;
