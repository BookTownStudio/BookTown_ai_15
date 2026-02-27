type LocalEditionFixture = {
  id: string;
  editionId: string;
  bookId: string;
  source: "booktown";
  externalId: string;
  title: string;
  titleEn: string;
  titleAr: string;
  authors: string[];
  authorEn: string;
  authorAr: string;
  description: string;
  descriptionEn: string;
  descriptionAr: string;
  coverUrl: string;
  language: string;
  hasEbook: boolean;
  downloadable: boolean;
  isbn13?: string;
  isbn10?: string;
  normalizedTitle: string;
  authorNamesNormalized: string[];
  search: {
    tokens: string[];
  };
  canonicalKey: string;
};

const base = (
  id: string,
  source: "booktown",
  title: string,
  authors: string[],
  downloadable: boolean,
  extra: Partial<LocalEditionFixture> = {}
): LocalEditionFixture => {
  const externalId = `${id}_ext`;
  const titleNorm = normalize(title);
  const authorNorm = normalize(authors.join(" "));
  return {
    id,
    editionId: id,
    bookId: `book_${id}`,
    source,
    externalId,
    title,
    titleEn: title,
    titleAr: "",
    authors,
    authorEn: authors[0] || "Unknown",
    authorAr: "",
    description: "Description",
    descriptionEn: "Description",
    descriptionAr: "",
    coverUrl: "",
    language: "en",
    hasEbook: downloadable,
    downloadable,
    normalizedTitle: titleNorm,
    authorNamesNormalized: [authorNorm],
    search: {
      tokens: Array.from(
      new Set([
        ...tokenize(titleNorm),
        ...authors.flatMap((entry) => tokenize(normalize(entry))),
      ])
      ),
    },
    canonicalKey: `${normalize(authors[0] || "unknown")}::${titleNorm}`,
    ...extra,
  };
};

export const LOCAL_EDITIONS: LocalEditionFixture[] = [
  base(
    "e1",
    "booktown",
    "Harry Potter and the Philosopher Stone",
    ["J. K. Rowling"],
    true,
    {
      isbn13: "9780747532743",
      isbn10: "0747532745",
    }
  ),
  base(
    "e2",
    "booktown",
    "Harry Potter and the Chamber of Secrets",
    ["J. K. Rowling"],
    true
  ),
  base(
    "e3",
    "booktown",
    "Harry Potter and the Prisoner of Azkaban",
    ["J. K. Rowling"],
    false
  ),
  base(
    "e4",
    "booktown",
    "Harry S Truman Conference Proceedings",
    ["Historian"],
    false
  ),
  base(
    "e5",
    "booktown",
    "Steppenwolf",
    ["Hermann Hesse"],
    false
  ),
  base(
    "e6",
    "booktown",
    "Siddhartha",
    ["Hermann Hesse"],
    false
  ),
  base(
    "e7",
    "booktown",
    "J. K. Rowling A Biography",
    ["Biographer"],
    false
  ),
  base(
    "e8",
    "booktown",
    "Ebook Filter Primary Novel",
    ["Test Author"],
    true
  ),
  base(
    "e9",
    "booktown",
    "Ebook Filter Print Edition",
    ["Test Author"],
    false
  ),
  base(
    "e10",
    "booktown",
    "Ebook Filter Digital Edition",
    ["Test Author"],
    true
  ),
  base(
    "e11",
    "booktown",
    "Financial Strategy",
    ["Patel"],
    false
  ),
  base(
    "e12",
    "booktown",
    "Financial Report 2022",
    ["Gov Agency"],
    false
  ),
  base(
    "e13",
    "booktown",
    "Harry Potter and the Goblet of Fire",
    ["J. K. Rowling"],
    true
  ),
  base(
    "e14",
    "booktown",
    "Harry Potter and the Order of the Phoenix",
    ["J. K. Rowling"],
    true
  ),
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  const stopwords = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
  return value
    .split(" ")
    .filter((token) => token.length > 1 && !stopwords.has(token));
}
