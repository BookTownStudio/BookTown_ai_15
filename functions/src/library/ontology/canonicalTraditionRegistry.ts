export const CANONICAL_TRADITION_REGISTRY = {
  african_american_literary_tradition: {
    label: "African American Literary Tradition",
    phase: 1,
  },

  african_postcolonial: {
    label: "African Postcolonial Literature",
    phase: 1,
  },

  american_transcendentalist: {
    label: "American Transcendentalism",
    phase: 1,
  },

  arabic_islamic_classical: {
    label: "Arabic-Islamic Classical Tradition",
    phase: 1,
  },

  arabic_modern: {
    label: "Modern Arabic Literature",
    phase: 1,
  },

  chinese_classical: {
    label: "Chinese Classical Literature",
    phase: 1,
  },

  colonial_modernism: {
    label: "Colonial Modernism",
    phase: 1,
  },

  east_asian_classical: {
    label: "East Asian Classical Tradition",
    phase: 1,
  },

  existential_modernism: {
    label: "Existential Modernism",
    phase: 1,
  },

  french_realism: {
    label: "French Realism",
    phase: 1,
  },

  german_modernism: {
    label: "German Modernism",
    phase: 1,
  },

  greco_roman_classical: {
    label: "Greco-Roman Classical Tradition",
    phase: 1,
  },

  high_modernism: {
    label: "High Modernism",
    phase: 1,
  },

  indian_classical: {
    label: "Indian Classical Tradition",
    phase: 1,
  },

  japanese_classical: {
    label: "Japanese Classical Literature",
    phase: 1,
  },

  japanese_modern: {
    label: "Japanese Modern Literature",
    phase: 1,
  },

  latin_american_boom: {
    label: "Latin American Boom",
    phase: 1,
  },

  latin_american_literary_tradition: {
    label: "Latin American Literary Tradition",
    phase: 1,
  },

  latin_american_magical_realism: {
    label: "Latin American Magical Realism",
    phase: 1,
  },

  lusophone_african: {
    label: "Lusophone African Literature",
    phase: 1,
  },

  medieval_european: {
    label: "Medieval European Literature",
    phase: 1,
  },

  mesopotamian_classical: {
    label: "Mesopotamian Classical Tradition",
    phase: 1,
  },

  persian_classical: {
    label: "Persian Classical Literature",
    phase: 1,
  },

  portuguese_modernism: {
    label: "Portuguese Modernism",
    phase: 1,
  },

  post_boom_latin_american: {
    label: "Post-Boom Latin American Literature",
    phase: 1,
  },

  russian_literary_tradition: {
    label: "Russian Literary Tradition",
    phase: 1,
  },

  russian_modernism: {
    label: "Russian Modernism",
    phase: 1,
  },

  sacred_scriptural_traditions: {
    label: "Sacred Scriptural Traditions",
    phase: 1,
  },

  southern_gothic: {
    label: "Southern Gothic",
    phase: 1,
  },

  western_early_modern: {
    label: "Western Early Modern Literature",
    phase: 1,
  },

  western_medieval: {
    label: "Western Medieval Literature",
    phase: 1,
  },

  western_modern: {
    label: "Western Modern Literature",
    phase: 1,
  },
} as const;

export type CanonicalTraditionRegistryKey =
  keyof typeof CANONICAL_TRADITION_REGISTRY;