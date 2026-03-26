import type { NarrationProviderKind } from '../runtime/contracts.ts';

export interface SpeechProviderSpeakRequest {
  text: string;
  rate: number;
  lang: string;
  onEnd: () => void;
  onError: (error: Error) => void;
}

export interface SpeechProvider {
  readonly kind: NarrationProviderKind;
  isSupported(): boolean;
  speak(request: SpeechProviderSpeakRequest): void;
  pause(): boolean;
  resume(): boolean;
  stop(): void;
  destroy(): void;
}
