import type { NarrationProviderKind } from '../runtime/contracts.ts';
import type { SpeechProvider, SpeechProviderSpeakRequest } from './speechProvider.ts';

type SpeechSynthesisRuntimeWindow = Window & {
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

function toNarrationError(error: string | undefined): Error {
  return new Error(error && error.length > 0 ? error : 'Speech synthesis failed.');
}

function selectVoice(
  synthesis: SpeechSynthesis,
  lang: string
): SpeechSynthesisVoice | null {
  const normalized = lang.toLowerCase();
  const prefix = normalized.split('-')[0];
  const voices = synthesis.getVoices();

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalized) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${prefix}-`)) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ||
    null
  );
}

export class BrowserSpeechSynthesisProvider implements SpeechProvider {
  readonly kind: NarrationProviderKind = 'browser_speech_synthesis';

  private readonly win: SpeechSynthesisRuntimeWindow;
  private sequence = 0;

  constructor(win: Window) {
    this.win = win as SpeechSynthesisRuntimeWindow;
  }

  isSupported(): boolean {
    return (
      typeof this.win !== 'undefined' &&
      'speechSynthesis' in this.win &&
      'SpeechSynthesisUtterance' in this.win
    );
  }

  speak(request: SpeechProviderSpeakRequest): void {
    if (!this.isSupported()) {
      throw new Error('Speech synthesis is not supported in this browser.');
    }

    this.stop();

    const synthesis = this.win.speechSynthesis;
    const Utterance = this.win.SpeechSynthesisUtterance;
    if (!Utterance) {
      throw new Error('Speech synthesis utterance is not supported in this browser.');
    }
    const utterance = new Utterance(request.text);
    const token = ++this.sequence;

    utterance.lang = request.lang;
    utterance.rate = request.rate;
    utterance.voice = selectVoice(synthesis, request.lang);
    utterance.onend = () => {
      if (token !== this.sequence) return;
      request.onEnd();
    };
    utterance.onerror = (event) => {
      if (token !== this.sequence) return;
      const errorName = typeof event.error === 'string' ? event.error : undefined;
      if (errorName === 'canceled' || errorName === 'interrupted') {
        return;
      }
      request.onError(toNarrationError(errorName));
    };

    synthesis.speak(utterance);
  }

  pause(): boolean {
    if (!this.isSupported()) return false;
    const synthesis = this.win.speechSynthesis;
    if (!synthesis.speaking || synthesis.paused) return false;
    synthesis.pause();
    return true;
  }

  resume(): boolean {
    if (!this.isSupported()) return false;
    const synthesis = this.win.speechSynthesis;
    if (!synthesis.paused) return false;
    synthesis.resume();
    return true;
  }

  stop(): void {
    if (!this.isSupported()) return;
    this.sequence += 1;
    this.win.speechSynthesis.cancel();
  }

  destroy(): void {
    this.stop();
  }
}
