import type { LiteraryRelationship } from "./literaryRelationship";

export const SEED_LITERARY_RELATIONSHIPS: LiteraryRelationship[] = [
  {
    schemaVersion: 1,

    fromEntityType: "book",
    fromEntityId: "The Divine Comedy",

    toEntityType: "book",
    toEntityId: "The Odyssey",

    relationshipType: "influenced_by",

    confidence: 0.98,

    source: "seed",

    createdAt: new Date(),
  },

  {
    schemaVersion: 1,

    fromEntityType: "book",
    fromEntityId: "Ulysses",

    toEntityType: "book",
    toEntityId: "The Odyssey",

    relationshipType: "responds_to",

    confidence: 0.99,

    source: "seed",

    createdAt: new Date(),
  },

  {
    schemaVersion: 1,

    fromEntityType: "book",
    fromEntityId: "One Hundred Years of Solitude",

    toEntityType: "book",
    toEntityId: "Pedro Páramo",

    relationshipType: "influenced_by",

    confidence: 0.95,

    source: "seed",

    createdAt: new Date(),
  },
];