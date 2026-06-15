import React from "react";
import type { Book } from "../../types/entities.ts";
import type { AuthorReaderMemoryModel } from "../../lib/hooks/useAuthorReaderMemory.ts";
import BilingualText from "../ui/BilingualText.tsx";
import BookCard from "../content/BookCard.tsx";
import { BookIcon } from "../icons/BookIcon.tsx";

interface AuthorContinueModuleProps {
  readonly continuation: AuthorReaderMemoryModel["continuation"] | undefined;
  readonly lang: "en" | "ar";
  readonly onBookClick: (bookId: string) => void;
}

function reasonLabel(reason: AuthorReaderMemoryModel["continuation"]["reason"], lang: "en" | "ar"): string {
  if (lang === "ar") {
    switch (reason) {
      case "currently_reading":
        return "أكمل العمل الحالي";
      case "next_unread_chronological":
        return "العمل التالي زمنياً";
      case "major_work":
        return "عمل رئيسي";
      case "available_booktown_work":
        return "متاح في بوكتاون";
      default:
        return "لا يوجد مسار متابعة";
    }
  }
  switch (reason) {
    case "currently_reading":
      return "Continue currently reading";
    case "next_unread_chronological":
      return "Next unread chronological work";
    case "major_work":
      return "Major work";
    case "available_booktown_work":
      return "Available in BookTown";
    default:
      return "No continuation available";
  }
}

const AuthorContinueModule: React.FC<AuthorContinueModuleProps> = ({
  continuation,
  lang,
  onBookClick,
}) => {
  const book: Book | null = continuation?.book ?? null;

  return (
    <section className="border-t border-white/10 pt-8">
      <div className="mb-5">
        <BilingualText role="H1" className="!text-xl">
          {lang === "en" ? "Continue This Author" : "تابع هذا المؤلف"}
        </BilingualText>
        <BilingualText role="Caption" className="mt-1 text-white/50">
          {lang === "en"
            ? "A deterministic next step from canonical reading state and bibliography."
            : "خطوة تالية حتمية من حالة القراءة والقائمة القانونية."}
        </BilingualText>
      </div>

      {book ? (
        <div className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <BookIcon className="h-3.5 w-3.5" />
              {reasonLabel(continuation?.reason ?? "none", lang)}
            </div>
            <BilingualText role="H2" className="!text-lg">
              {lang === "en" ? book.titleEn : book.titleAr}
            </BilingualText>
            <BilingualText role="Caption" className="mt-1 text-white/50">
              {continuation?.label ?? reasonLabel("none", lang)}
            </BilingualText>
          </div>
          <button
            type="button"
            onClick={() => onBookClick(book.id)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.05] p-2 text-left transition hover:bg-white/[0.08] sm:w-64"
          >
            <BookCard bookId={book.id} layout="list" />
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/12 bg-white/[0.03] px-4 py-5 text-white/60">
          <BilingualText role="Caption">
            {lang === "en"
              ? "No canonical continuation path is available yet."
              : "لا يوجد مسار قانوني للمتابعة حالياً."}
          </BilingualText>
        </div>
      )}
    </section>
  );
};

export default AuthorContinueModule;
