import type { CanonicalEntity } from "./canonicalEntities";

export const SEED_CANONICAL_ENTITIES: CanonicalEntity[] = [
  {
    schemaVersion: 1,

    entityId: "greco_roman_classical",

    type: "tradition",

    slug: "greco-roman-classical",

    title: "Greco-Roman Classical",

    description:
      "Classical literary and philosophical tradition emerging from Ancient Greece and Rome.",

    createdAt: new Date(),

    source: "seed",
  },

  {
    schemaVersion: 1,

    entityId: "existential_modernism",

    type: "movement",

    slug: "existential-modernism",

    title: "Existential Modernism",

    description:
      "Modern literary and philosophical movement centered on alienation, freedom, absurdity, and existential meaning.",

    createdAt: new Date(),

    source: "seed",
  },

  {
    schemaVersion: 1,

    entityId: "arabic_islamic_classical",

    type: "civilization",

    slug: "arabic-islamic-classical",

    title: "Arabic-Islamic Classical",

    description:
      "Classical intellectual and literary tradition emerging from the Arabic-Islamic world.",

    createdAt: new Date(),

    source: "seed",
  },
];