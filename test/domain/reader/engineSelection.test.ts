import { describe, expect, it } from 'vitest';
import { resolveReaderEngine } from '../../../lib/reader/runtime/engineSelection.ts';

describe('resolveReaderEngine', () => {
  it('maps web pdf to web_pdf', () => {
    const result = resolveReaderEngine({ platform: 'web', format: 'pdf' });
    expect(result).toEqual({ engine: 'web_pdf', format: 'pdf' });
  });

  it('maps web epub to web_epub', () => {
    const result = resolveReaderEngine({ platform: 'web', format: 'epub' });
    expect(result).toEqual({ engine: 'web_epub', format: 'epub' });
  });

  it('maps native pdf to native_pdf', () => {
    const result = resolveReaderEngine({ platform: 'native', format: 'pdf' });
    expect(result).toEqual({ engine: 'native_pdf', format: 'pdf' });
  });

  it('maps native epub to native_epub', () => {
    const result = resolveReaderEngine({ platform: 'native', format: 'epub' });
    expect(result).toEqual({ engine: 'native_epub', format: 'epub' });
  });

  it('fails closed for unknown formats', () => {
    const webUnknown = resolveReaderEngine({ platform: 'web', format: 'unknown' });
    const nativeUnknown = resolveReaderEngine({ platform: 'native', format: 'unknown' });
    expect(webUnknown).toEqual({ engine: 'unsupported', format: 'unknown' });
    expect(nativeUnknown).toEqual({ engine: 'unsupported', format: 'unknown' });
  });
});
