export type CanonicalEntityType =
  | "tradition"
  | "movement"
  | "philosophy"
  | "civilization"
  | "historical_period";

export type CanonicalEntity = {
  schemaVersion: 1;

  entityId: string;

  type: CanonicalEntityType;

  slug: string;

  title: string;

  description?: string;

  aliases?: string[];

  createdAt: Date;

  source:
    | "seed"
    | "editorial"
    | "migration";
};