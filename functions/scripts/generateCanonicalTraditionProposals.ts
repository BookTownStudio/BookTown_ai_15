import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

admin.initializeApp();

const db = admin.firestore();

import type { CanonicalTradition } from "../src/library/ontology/bookOntology";

interface Proposal {
  bookId: string;
  canonicalTitle: string;
  canonicalAuthor: string;
  proposedCanonicalTradition: CanonicalTradition;
  confidence: number;
  reasoning: string;
  proposalSource: string;
  reviewStatus: "pending";
}

const AUTHOR_TRADITIONS: Record<string, CanonicalTradition> = {
  "homer": "greco_roman_classical",
  "virgil": "greco_roman_classical",
  "plato": "greco_roman_classical",
  "aeschylus": "greco_roman_classical",

  "leo tolstoy": "russian_literary_tradition",
  "fyodor dostoevsky": "russian_literary_tradition",
  "nikolai gogol": "russian_literary_tradition",
  "vasily grossman": "russian_literary_tradition",
  "mikhail bulgakov": "russian_literary_tradition",

  "gabriel garcia marquez": "latin_american_literary_tradition",
  "jorge luis borges": "latin_american_literary_tradition",
  "juan rulfo": "latin_american_literary_tradition",
  "roberto bolano": "latin_american_literary_tradition",
  "isabel allende": "latin_american_literary_tradition",

  "ibn khaldun": "arabic_islamic_classical",
  "naguib mahfouz": "global_modern_postcolonial",
  "tayeb salih": "global_modern_postcolonial",
  "ghassan kanafani": "global_modern_postcolonial",
  "mahmoud darwish": "global_modern_postcolonial",

  "hafez": "persian_classical",
  "ferdowsi": "persian_classical",
  "farid ud-din attar": "persian_classical",

  "confucius": "chinese_classical",
  "cao xueqin": "chinese_classical",
  "wu cheng'en": "chinese_classical",

  "murasaki shikibu": "japanese_classical",
  "natsume soseki": "japanese_classical",
  "junichiro tanizaki": "japanese_classical",
  "yasunari kawabata": "japanese_classical",

  "chinua achebe": "african_oral_literary_tradition",
  "ben okri": "african_oral_literary_tradition",
  "amos tutuola": "african_oral_literary_tradition",

  "anonymous": "ancient_near_eastern",
  "various": "sacred_scriptural_traditions",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function classifyBook(
  title: string,
  author: string,
  form?: string
): {
  tradition: CanonicalTradition;
  confidence: number;
  reasoning: string;
} {
  const normalizedAuthor = normalize(author);

  if (AUTHOR_TRADITIONS[normalizedAuthor]) {
    return {
      tradition: AUTHOR_TRADITIONS[normalizedAuthor],
      confidence: 0.95,
      reasoning: `Matched author authority map for ${author}`,
    };
  }

  if (form === "Religious Text") {
    return {
      tradition: "sacred_scriptural_traditions",
      confidence: 0.98,
      reasoning: "Religious text classification",
    };
  }

  if (form === "epic") {
    return {
      tradition: "greco_roman_classical",
      confidence: 0.7,
      reasoning: "Epic literary form heuristic",
    };
  }

  return {
    tradition: "unknown",
    confidence: 0.2,
    reasoning: "No deterministic classification found",
  };
}

async function main() {
  const snapshot = await db.collection("books").get();

  const proposals: Proposal[] = [];

  let unknownCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    const title =
      data.canonicalTitle ||
      data.title ||
      "Unknown Title";

    const author =
      data.author ||
      data.authorName ||
      (Array.isArray(data.authorNames)
        ? data.authorNames[0]
        : "Unknown Author");

    const form =
      data?.ontology?.form ||
      data.literaryForm ||
      "";

    const classification = classifyBook(
      title,
      author,
      form
    );

    if (classification.tradition === "unknown") {
      unknownCount++;
    }

    proposals.push({
      bookId: doc.id,
      canonicalTitle: title,
      canonicalAuthor: author,
      proposedCanonicalTradition:
        classification.tradition,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      proposalSource:
        "generateCanonicalTraditionProposals.v1",
      reviewStatus: "pending",
    });
  }

  const outputPath = path.resolve(
    __dirname,
    "../data/canonicalTraditionAuthority.v1.json"
  );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(proposals, null, 2),
    "utf8"
  );

  console.log("\n=== GENERATION COMPLETE ===\n");

  console.log(
    JSON.stringify(
      {
        totalBooks: proposals.length,
        unknownCount,
        generatedFile: outputPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
