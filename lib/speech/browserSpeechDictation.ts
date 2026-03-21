type SpeechRecognitionCtor = new () => any;

export type BrowserSpeechDictationErrorCode =
  | 'unsupported'
  | 'permission_denied'
  | 'audio_capture'
  | 'network'
  | 'no_speech'
  | 'aborted'
  | 'unknown';

export type BrowserSpeechSupportLevel = 'supported' | 'limited' | 'unsupported';
export type BrowserSpeechEngine = 'standard' | 'webkit' | 'none';
export type BrowserSpeechPlatform = 'desktop' | 'ipad' | 'iphone' | 'android' | 'unknown';

export interface BrowserSpeechSupportInfo {
  level: BrowserSpeechSupportLevel;
  engine: BrowserSpeechEngine;
  platform: BrowserSpeechPlatform;
  reason: 'standard_engine' | 'webkit_engine' | 'apple_webkit' | 'unsupported_api';
}

export interface BrowserSpeechSessionEndEvent {
  userInitiated: boolean;
}

export interface BrowserSpeechSessionCallbacks {
  onStart: () => void;
  onFinalTranscript: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
  onError: (code: BrowserSpeechDictationErrorCode) => void;
  onEnd: (event: BrowserSpeechSessionEndEvent) => void;
}

export interface BrowserSpeechSession {
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

function resolveSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : null;
}

function resolveSpeechEngine(): BrowserSpeechEngine {
  if (typeof window === 'undefined') return 'none';
  if (typeof (window as any).SpeechRecognition === 'function') return 'standard';
  if (typeof (window as any).webkitSpeechRecognition === 'function') return 'webkit';
  return 'none';
}

function resolveSpeechPlatform(): BrowserSpeechPlatform {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const userAgent = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIpadOsDesktopMode = platform === 'MacIntel' && maxTouchPoints > 1;

  if (isIpadOsDesktopMode || /iPad/i.test(userAgent)) return 'ipad';
  if (/iPhone/i.test(userAgent)) return 'iphone';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh|Windows|Linux|X11/i.test(userAgent)) return 'desktop';
  return 'unknown';
}

function isAppleWebKitBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const vendor = navigator.vendor || '';

  const isAppleVendor = /Apple/i.test(vendor);
  const isNonSafariIosShell = /CriOS|FxiOS|EdgiOS/i.test(userAgent);
  const isNonSafariDesktopShell = /Chrome|Chromium|Edg|OPR|Firefox/i.test(userAgent);

  return isAppleVendor && !isNonSafariIosShell && !isNonSafariDesktopShell;
}

function mapSpeechErrorCode(rawCode: unknown): BrowserSpeechDictationErrorCode {
  if (rawCode === 'not-allowed' || rawCode === 'service-not-allowed') {
    return 'permission_denied';
  }
  if (rawCode === 'audio-capture') {
    return 'audio_capture';
  }
  if (rawCode === 'network') {
    return 'network';
  }
  if (rawCode === 'no-speech') {
    return 'no_speech';
  }
  if (rawCode === 'aborted') {
    return 'aborted';
  }
  return 'unknown';
}

export function isBrowserSpeechRecognitionSupported(): boolean {
  return getBrowserSpeechSupportInfo().level !== 'unsupported';
}

export function getBrowserSpeechSupportInfo(): BrowserSpeechSupportInfo {
  const ctor = resolveSpeechRecognitionCtor();
  const engine = resolveSpeechEngine();
  const platform = resolveSpeechPlatform();

  if (!ctor || engine === 'none') {
    return {
      level: 'unsupported',
      engine: 'none',
      platform,
      reason: 'unsupported_api',
    };
  }

  const isAppleWebKit = isAppleWebKitBrowser();
  const isAppleMobile = platform === 'ipad' || platform === 'iphone';

  if (engine === 'webkit' || isAppleWebKit || isAppleMobile) {
    return {
      level: 'limited',
      engine,
      platform,
      reason: isAppleWebKit || isAppleMobile ? 'apple_webkit' : 'webkit_engine',
    };
  }

  return {
    level: 'supported',
    engine,
    platform,
    reason: 'standard_engine',
  };
}

export function createBrowserSpeechSession(
  language: string,
  callbacks: BrowserSpeechSessionCallbacks
): BrowserSpeechSession {
  const supportInfo = getBrowserSpeechSupportInfo();
  const RecognitionCtor = resolveSpeechRecognitionCtor();
  if (!RecognitionCtor || supportInfo.level === 'unsupported') {
    throw new Error('Speech recognition unsupported');
  }

  const recognition = new RecognitionCtor();
  let disposed = false;
  let userInitiatedStop = false;
  let processedFinalResultIndex = 0;

  recognition.lang = language;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    if (disposed) return;
    callbacks.onStart();
  };

  recognition.onresult = (event: any) => {
    if (disposed) return;

    let interimTranscript = '';
    const finalChunks: string[] = [];

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      if (index < processedFinalResultIndex) {
        continue;
      }

      const transcript = String(event.results[index]?.[0]?.transcript ?? '').trim();
      if (!transcript) {
        continue;
      }

      if (event.results[index].isFinal) {
        finalChunks.push(transcript);
        processedFinalResultIndex = index + 1;
      } else {
        interimTranscript = `${interimTranscript} ${transcript}`.trim();
      }
    }

    callbacks.onInterimTranscript?.(interimTranscript);

    if (finalChunks.length > 0) {
      callbacks.onFinalTranscript(finalChunks.join(' '));
    }
  };

  recognition.onerror = (event: any) => {
    if (disposed) return;
    callbacks.onError(mapSpeechErrorCode(event?.error));
  };

  recognition.onend = () => {
    if (disposed) return;
    callbacks.onEnd({ userInitiated: userInitiatedStop });
    userInitiatedStop = false;
  };

  return {
    start() {
      recognition.start();
    },
    stop() {
      userInitiatedStop = true;
      try {
        recognition.stop();
      } catch {
        callbacks.onEnd({ userInitiated: true });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      userInitiatedStop = true;
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // Ignore stop failures during teardown.
      }
    },
  };
}
