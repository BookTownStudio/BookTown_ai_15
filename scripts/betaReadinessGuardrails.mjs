import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const CHECKS = [
  {
    name: 'Home must remain capped at four rows',
    file: 'functions/src/home/getHomeDiscoveryConsole.ts',
    required: /const\s+MAX_ROWS\s*=\s*4;/,
  },
  {
    name: 'Home callable must remain backend-owned',
    file: 'functions/src/domains/home.ts',
    required: /getHomeDiscoveryConsole/,
  },
  {
    name: 'Home preservation doctrine must exist',
    file: 'docs/architecture/HOME_DISCOVERY_CONSOLE_PRESERVATION.md',
    required: /Home Discovery Console Preservation Doctrine/,
  },
  {
    name: 'Home readiness log must include preservation guardrails',
    file: 'functions/src/home/getHomeDiscoveryConsole.ts',
    required: /preservationGuardrails/,
  },
  {
    name: 'Home readiness log must include ecosystem continuity observation',
    file: 'functions/src/home/getHomeDiscoveryConsole.ts',
    required: /ecosystemContinuity/,
  },
  {
    name: 'Private manuscript content must not enter Home continuity',
    file: 'functions/src/home/getHomeDiscoveryConsole.ts',
    forbidden: /asString\(data\.(?:content|contentDoc|manuscript|body|text)\b/,
  },
  {
    name: 'Home must not introduce infinite scroll mechanics',
    file: 'app/tabs/home.tsx',
    forbidden: /useInfiniteQuery|fetchNextPage|hasNextPage|onEndReached|IntersectionObserver/,
  },
  {
    name: 'Home must not introduce notification-pressure coupling',
    file: 'app/tabs/home.tsx',
    forbidden: /notification|pushToken|engagementPrompt|streakPrompt/i,
  },
  {
    name: 'Home frontend must consume backend console authority',
    file: 'app/tabs/home.tsx',
    required: /useHomeDiscoveryConsole/,
  },
];

const failures = [];

for (const check of CHECKS) {
  const absolutePath = path.join(ROOT, check.file);
  let source = '';
  try {
    source = readFileSync(absolutePath, 'utf8');
  } catch (error) {
    failures.push(`${check.name}: missing ${check.file}`);
    continue;
  }

  if (check.required && !check.required.test(source)) {
    failures.push(`${check.name}: required pattern missing in ${check.file}`);
  }
  if (check.forbidden && check.forbidden.test(source)) {
    failures.push(`${check.name}: forbidden pattern found in ${check.file}`);
  }
}

if (failures.length > 0) {
  console.error('[beta-readiness] Preservation guardrail violations:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('[beta-readiness] Home preservation guardrails passed.');
