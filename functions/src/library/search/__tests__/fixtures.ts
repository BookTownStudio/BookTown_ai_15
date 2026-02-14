type LocalEditionFixture = {
  id: string;
  editionId: string;
  bookId: string;
  source: "googleBooks" | "openLibrary";
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
  searchTitleNormalized: string;
  searchAuthorNormalized: string;
  searchTokens: string[];
};

const base = (
  id: string,
  source: "googleBooks" | "openLibrary",
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
    searchTitleNormalized: titleNorm,
    searchAuthorNormalized: authorNorm,
    searchTokens: Array.from(
      new Set([
        ...tokenize(titleNorm),
        ...authors.flatMap((entry) => tokenize(normalize(entry))),
      ])
    ),
    ...extra,
  };
};

export const LOCAL_EDITIONS: LocalEditionFixture[] = [
  base(
    "e1",
    "googleBooks",
    "Harry Potter and the Philosopher Stone",
    ["J. K. Rowling"],
    true
  ),
  base(
    "e2",
    "googleBooks",
    "Harry Potter and the Chamber of Secrets",
    ["J. K. Rowling"],
    true
  ),
  base(
    "e3",
    "openLibrary",
    "Harry Potter and the Prisoner of Azkaban",
    ["J. K. Rowling"],
    false
  ),
  base(
    "e4",
    "openLibrary",
    "Harry S Truman Conference Proceedings",
    ["Historian"],
    false
  ),
  base(
    "e5",
    "googleBooks",
    "Steppenwolf",
    ["Hermann Hesse"],
    false
  ),
  base(
    "e6",
    "googleBooks",
    "Siddhartha",
    ["Hermann Hesse"],
    false
  ),
  base(
    "e7",
    "openLibrary",
    "J. K. Rowling A Biography",
    ["Biographer"],
    false
  ),
  base(
    "e8",
    "googleBooks",
    "Ebook Filter Primary Novel",
    ["Test Author"],
    true
  ),
  base(
    "e9",
    "openLibrary",
    "Ebook Filter Print Edition",
    ["Test Author"],
    false
  ),
  base(
    "e10",
    "googleBooks",
    "Ebook Filter Digital Edition",
    ["Test Author"],
    true
  ),
  base(
    "e11",
    "openLibrary",
    "Financial Strategy",
    ["Patel"],
    false
  ),
  base(
    "e12",
    "openLibrary",
    "Financial Report 2022",
    ["Gov Agency"],
    false
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
