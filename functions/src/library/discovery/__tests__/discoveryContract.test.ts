import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Discovery Contract — Boundary', () => {
  it('has no executable discovery engine', () => {
    const enginePath = resolve(__dirname, '../discoveryEngine.ts');
    expect(existsSync(enginePath)).toBe(false);
  });

  it('keeps DISCOVERY_CONTRACT.md present', () => {
    const contractPath = resolve(__dirname, '../DISCOVERY_CONTRACT.md');
    expect(existsSync(contractPath)).toBe(true);
  });
});
