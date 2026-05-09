import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

admin.initializeApp();

const db = admin.firestore();

type EditorialEntry = {
  title: string;
  author: string;
  canonicalTradition: string;
};

/**
 A Bend in the River | V. S. Naipaul | global_modern_postcolonial
A General Theory of Oblivion | José Eduardo Agualusa | global_modern_postcolonial
A Passage to India | E. M. Forster | european_enlightenment_modern
Anna Karenina | Leo Tolstoy | russian_literary_tradition
Auto-da-Fé | Elias Canetti | european_enlightenment_modern
Beloved | Toni Morrison | global_modern_postcolonial
Berlin Alexanderplatz | Alfred Döblin | european_enlightenment_modern
Blindness | José Saramago | european_enlightenment_modern
Chronicle in Stone | Ismail Kadare | european_enlightenment_modern
Cities of Salt | Abdelrahman Munif | global_modern_postcolonial
Crime and Punishment | Fyodor Dostoevsky | russian_literary_tradition
Dead Souls | Nikolai Gogol | russian_literary_tradition
Dictionary of the Khazars | Milorad Pavić | european_enlightenment_modern
Divan of Hafez | Hafez | persian_classical
Don Quixote | Miguel de Cervantes | european_enlightenment_modern
Dream of the Red Chamber | Cao Xueqin | chinese_classical
Faust | Johann Wolfgang von Goethe | european_enlightenment_modern
Faust Part Two | Johann Wolfgang von Goethe | european_enlightenment_modern
God's Bits of Wood | Ousmane Sembène | african_oral_literary_tradition
Hamlet | William Shakespeare | european_enlightenment_modern
Heart of Darkness | Joseph Conrad | european_enlightenment_modern
Hopscotch | Julio Cortázar | latin_american_literary_tradition
Independent People | Halldór Laxness | european_enlightenment_modern
Invisible Man | Ralph Ellison | global_modern_postcolonial
Journey to the West | Wu Cheng'en | chinese_classical
Kokoro | Natsume Sōseki | japanese_classical
Leaves of Grass | Walt Whitman | european_enlightenment_modern
Life and Fate | Vasily Grossman | russian_literary_tradition
Macbeth | William Shakespeare | european_enlightenment_modern
Madame Bovary | Gustave Flaubert | european_enlightenment_modern
Memory for Forgetfulness | Mahmoud Darwish | global_modern_postcolonial
Men in the Sun | Ghassan Kanafani | global_modern_postcolonial
Middlemarch | George Eliot | european_enlightenment_modern
Midnight's Children | Salman Rushdie | global_modern_postcolonial
Miramar | Naguib Mahfouz | global_modern_postcolonial
Moby-Dick; or, The Whale | Herman Melville | european_enlightenment_modern
Mrs Dalloway | Virginia Woolf | european_enlightenment_modern
One Hundred Years of Solitude | Gabriel García Márquez | latin_american_literary_tradition
Pedro Páramo | Juan Rulfo | latin_american_literary_tradition
Pride and Prejudice | Jane Austen | european_enlightenment_modern
Rawāʾiʻ Jubrān Khalīl Jubrān | Kahlil Gibran | global_modern_postcolonial
Season of Migration to the North | Tayeb Salih | global_modern_postcolonial
Siddhartha | Hermann Hesse | european_enlightenment_modern
Six Characters in Search of an Author | Luigi Pirandello | european_enlightenment_modern
Snow Country | Yasunari Kawabata | japanese_classical
So Long a Letter | Mariama Bâ | african_oral_literary_tradition
Socrates | A. E. Taylor | european_enlightenment_modern
Socrates | Sarah Kofman | european_enlightenment_modern
Tanakh | Multi-author canonical scripture | sacred_scriptural_traditions
The Aeneid | Virgil | greco_roman_classical
The Aleph | Jorge Luis Borges | latin_american_literary_tradition
The Analects | Confucius | chinese_classical
The Autumn of the Patriarch | Gabriel García Márquez | latin_american_literary_tradition
The Bhagavad Gita | Anonymous | indian_classical
The Bible | Multi-author canonical scripture | sacred_scriptural_traditions
The Book of Chameleons | José Eduardo Agualusa | global_modern_postcolonial
The Book of Disquiet | Fernando Pessoa | european_enlightenment_modern
The Bridge on the Drina | Ivo Andrić | european_enlightenment_modern
The Brothers Karamazov | Fyodor Dostoevsky | russian_literary_tradition
The Cairo Trilogy | Naguib Mahfouz | global_modern_postcolonial
The Canterbury Tales | Geoffrey Chaucer | european_enlightenment_modern
The Conference of the Birds | Farid ud-Din Attar | persian_classical
The Death of Virgil | Hermann Broch | european_enlightenment_modern
The Divine Comedy | Dante Alighieri | european_enlightenment_modern
The Epic of Gilgamesh | Anonymous | ancient_near_eastern
The Famished Road | Ben Okri | african_oral_literary_tradition
The Forty Rules of Love | Elif Shafak | global_modern_postcolonial
The Golden Notebook | Doris Lessing | european_enlightenment_modern
The Hour of the Star | Clarice Lispector | latin_american_literary_tradition
The House of the Spirits | Isabel Allende | latin_american_literary_tradition
The Iliad | Homer | greco_roman_classical
The Invention of Morel | Adolfo Bioy Casares | latin_american_literary_tradition
The Leopard | Giuseppe Tomasi di Lampedusa | european_enlightenment_modern
The Longing of the Dervish | Hammour Ziada | global_modern_postcolonial
The Magic Mountain | Thomas Mann | european_enlightenment_modern
The Mahabharata | Vyasa | indian_classical
The Makioka Sisters | Junichiro Tanizaki | japanese_classical
The Man Without Qualities | Robert Musil | european_enlightenment_modern
The Master and Margarita | Mikhail Bulgakov | russian_literary_tradition
The Melancholy of Resistance | László Krasznahorkai | european_enlightenment_modern
The Metamorphosis | Franz Kafka | european_enlightenment_modern
The Muqaddimah | Ibn Khaldun | arabic_islamic_classical
The Name of the Rose | Umberto Eco | european_enlightenment_modern
The Odyssey | Homer | greco_roman_classical
The Open Veins of Latin America | Eduardo Galeano | latin_american_literary_tradition
The Oresteia | Aeschylus | greco_roman_classical
The Palm-Wine Drinkard | Amos Tutuola | african_oral_literary_tradition
The Pillow Book | Sei Shōnagon | japanese_classical
The Plague | Albert Camus | european_enlightenment_modern
The Prince | Niccolò Machiavelli | european_enlightenment_modern
The Quran | Revealed text | sacred_scriptural_traditions
The Radetzky March | Joseph Roth | european_enlightenment_modern
The Republic | Plato | greco_roman_classical
The Savage Detectives | Roberto Bolaño | latin_american_literary_tradition
The Second Sex | Simone de Beauvoir | european_enlightenment_modern
The Shahnameh | Ferdowsi | persian_classical
The Silent Cry | Kenzaburō Ōe | japanese_classical
The Sound and the Fury | William Faulkner | european_enlightenment_modern
The Story of the Stone | Cao Xueqin | chinese_classical
The Stranger | Albert Camus | european_enlightenment_modern
The Tale of Genji | Murasaki Shikibu | japanese_classical
The Tale of Kieu | Nguyễn Du | southeast_asian_classical
The Three-Arched Bridge | Ismail Kadare | european_enlightenment_modern
The Trial | Franz Kafka | european_enlightenment_modern
The Trial of Dedan Kimathi | Ngũgĩ wa Thiong’o | african_oral_literary_tradition
The Tunnel | Ernesto Sabato | latin_american_literary_tradition
The Vegetarian | Han Kang | global_modern_postcolonial
The Waste Land | T. S. Eliot | european_enlightenment_modern
The Woman in the Dunes | Kōbō Abe | japanese_classical
The Yacoubian Building | Alaa Al Aswany | global_modern_postcolonial
Their Eyes Were Watching God | Zora Neale Hurston | global_modern_postcolonial
Things Fall Apart | Chinua Achebe | african_oral_literary_tradition
Thus Spoke Zarathustra | Friedrich Nietzsche | european_enlightenment_modern
To the Lighthouse | Virginia Woolf | european_enlightenment_modern
Train to Pakistan | Khushwant Singh | global_modern_postcolonial
Waiting for Godot | Samuel Beckett | european_enlightenment_modern
War and Peace | Leo Tolstoy | russian_literary_tradition
Woman at Point Zero | Nawal El Saadawi | global_modern_postcolonial
السباخون | Abdelrahman Munif | global_modern_postcolonial
 */

const EDITORIAL_RAW = `

`;

const EDITORIAL_DATA: EditorialEntry[] = EDITORIAL_RAW
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [title, author, canonicalTradition] =
      line.split("|").map((v) => v.trim());

    return {
      title,
      author,
      canonicalTradition,
    };
  });

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function run() {
  const snapshot = await db.collection("books").get();

  const editorialMap = new Map<string, string>();

  for (const entry of EDITORIAL_DATA) {
    const key = `${normalize(entry.title)}::${normalize(entry.author)}`;

    editorialMap.set(key, entry.canonicalTradition);
  }

  const mappings: Record<string, string> = {};

  const unmatchedFirestore: string[] = [];
  const matchedEditorial = new Set<string>();

  snapshot.forEach((doc) => {
    const data = doc.data();

    const title =
      data.canonicalTitle ||
      data.title ||
      "";

    const author =
        data.author ||
        data.authorName ||
        (Array.isArray(data.authorNames)
            ? data.authorNames[0]
            : "") ||
        "";

    const key = `${normalize(title)}::${normalize(author)}`;

    if (Object.keys(mappings).length < 5) {
  console.log({
    firestoreKey: key,
    title,
    author,
  });
}

    const canonicalTradition = editorialMap.get(key);

    if (!canonicalTradition) {
      unmatchedFirestore.push(
        `${doc.id} | ${title} | ${author}`
      );
      return;
    }

    mappings[doc.id] = canonicalTradition;

    matchedEditorial.add(key);
  });

  const unmatchedEditorial: string[] = [];

  for (const entry of EDITORIAL_DATA) {
    const key = `${normalize(entry.title)}::${normalize(entry.author)}`;

    if (!matchedEditorial.has(key)) {
      unmatchedEditorial.push(
        `${entry.title} | ${entry.author}`
      );
    }
  }

  const output = `
export const canonicalTraditionMappings: Record<string, string> = ${JSON.stringify(
    mappings,
    null,
    2
  )};
`;

  const outputPath = path.join(
    __dirname,
    "canonicalTraditionMappings.ts"
  );

  fs.writeFileSync(outputPath, output);

  console.log("\n=== BUILD COMPLETE ===\n");

  console.log(
    `Matched mappings: ${Object.keys(mappings).length}`
  );

  console.log(
    `Unmatched Firestore books: ${unmatchedFirestore.length}`
  );

  console.log(
    `Unmatched editorial entries: ${unmatchedEditorial.length}`
  );

  if (unmatchedFirestore.length) {
    console.log("\n--- Unmatched Firestore ---\n");

    unmatchedFirestore.forEach((v) => console.log(v));
  }

  if (unmatchedEditorial.length) {
    console.log("\n--- Unmatched Editorial ---\n");

    unmatchedEditorial.forEach((v) => console.log(v));
  }

  console.log("\nMappings file generated:\n");
  console.log(outputPath);
}

run().then(() => process.exit());