import {
  ReaderEngineKind,
  ReaderFormat,
  ReaderRuntimeSelection,
} from './contracts.ts';

interface ResolveReaderEngineParams {
  platform: 'web' | 'native';
  format: ReaderFormat;
}

export function resolveReaderEngine(params: ResolveReaderEngineParams): ReaderRuntimeSelection {
  const { platform, format } = params;
  if (format === 'unknown') {
    return {
      engine: 'unsupported',
      format,
    };
  }

  if (platform === 'native') {
    const engine: ReaderEngineKind =
      format === 'pdf' ? 'native_pdf' : 'native_epub';
    return { engine, format };
  }

  const engine: ReaderEngineKind =
    format === 'pdf' ? 'web_pdf' : 'web_epub';
  return { engine, format };
}
