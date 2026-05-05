import { materializeBookAuthority } from "../library/materializeBookAuthority";
import { buildCanonicalKey } from "../library/persistence/canonicalKey";

type LiteraryAuthorityClass = "classic_work";

type StarterCanonicalWork = {
  title: string;
  author: string;
  language: string;
  literaryAuthorityClass: LiteraryAuthorityClass;
};

type ScriptOptions = {
  dryRun: boolean;
};

const STARTER_WORKS: StarterCanonicalWork[] = [
  {
    title: "The Idiot",
    author: "Fyodor Dostoevsky",
    language: "en",
    literaryAuthorityClass: "classic_work",
  },
  {
    title: "Crime and Punishment",
    author: "Fyodor Dostoevsky",
    language: "en",
    literaryAuthorityClass: "classic_work",
  },
  {
    title: "The Trial",
    author: "Franz Kafka",
    language: "en",
    literaryAuthorityClass: "classic_work",
  },
  {
    title: "The Plague",
    author: "Albert Camus",
    language: "en",
    literaryAuthorityClass: "classic_work",
  },
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "_");
}

function parseDryRun(argv: string[]): boolean {
  const flag = argv.find((entry) => entry.startsWith("--dry-run="));
  if (!flag) return true;
  return flag.split("=")[1] !== "false";
}

function buildCanonicalDocId(work: StarterCanonicalWork): string {
  return `canonical_${slugify(work.author)}_${slugify(work.title)}`;
}

async function run(options: ScriptOptions): Promise<void> {
  for (const work of STARTER_WORKS) {
    const docId = buildCanonicalDocId(work);
    console.log(
      `[canonical-books][${options.dryRun ? "dry-run" : "create"}] ${docId} => "${work.title}" by ${work.author}`
    );

    if (!options.dryRun) {
      const result = await materializeBookAuthority({
        source: "booktown_canonical",
        authorityStatus: "canonical",
        preferredBookId: docId,
        rawBook: {
          id: docId,
          title: work.title,
          titleEn: work.title,
          titleAr: "",
          author: work.author,
          authorEn: work.author,
          authorAr: "",
          authors: [work.author],
          description: "",
          descriptionEn: "",
          descriptionAr: "",
          language: work.language,
          canonicalKey: buildCanonicalKey(work),
          literaryAuthorityClass: work.literaryAuthorityClass,
          rightsMode: "public_free",
          visibility: "public",
          publicationState: "published",
          canonicalLocked: true,
          hasEbook: false,
          downloadable: false,
          isEbookAvailable: false,
        },
        createEdition: false,
        ingestionKey: `canonical_seed:${buildCanonicalKey(work)}`,
        literaryAuthorityClass: work.literaryAuthorityClass,
      });

      console.log(
        `[canonical-books][materialized] ${docId} => bookId=${result.bookId} status=${result.status}`
      );
    }
  }

  console.log(`[canonical-books][done] dryRun=${options.dryRun}`);
}

const options: ScriptOptions = {
  dryRun: parseDryRun(process.argv.slice(2)),
};

run(options).catch((error) => {
  console.error("[canonical-books][fatal]", error);
  process.exitCode = 1;
});
