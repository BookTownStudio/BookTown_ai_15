import { devLog } from '../logging/devLog';
/**
 * MEDIA_PERMISSION_GUARD_V1
 * Authority: frontend_with_platform_enforcement
 * 
 * Intercepts and blocks preemptive media hardware requests.
 */

let userIntentFlag = false;

/**
 * Flags that the next media request is user-initiated and allowed.
 * Used by trusted entry points: onCameraIconClick, onMicrophoneIconClick, etc.
 */
export const allowNextMediaRequest = () => {
  userIntentFlag = true;
  // Reset flag after a short delay to ensure it only covers the immediate subsequent call
  setTimeout(() => {
    userIntentFlag = false;
  }, 1000);
};

export const initMediaGuard = () => {
  if (typeof window === 'undefined') return;

  const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  const OriginalAudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const OriginalSpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  // 1. Guard getUserMedia
  if (navigator.mediaDevices && originalGetUserMedia) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!userIntentFlag) {
        const error = "[GUARD_VIOLATION] Media permission requested without direct user action. Access blocked.";
        console.error(error);
        throw new Error(error);
      }
      return originalGetUserMedia(constraints);
    };
  }

  // 2. Guard AudioContext (Used for Voice analysis/recording)
  if (OriginalAudioContext) {
    const GuardedAudioContext = function(this: any, options?: AudioContextOptions) {
      if (!userIntentFlag) {
        const error = "[GUARD_VIOLATION] AudioContext initialized without direct user action. Access blocked.";
        console.error(error);
        throw new Error(error);
      }
      return new OriginalAudioContext(options);
    } as any;
    
    GuardedAudioContext.prototype = OriginalAudioContext.prototype;
    (window as any).AudioContext = GuardedAudioContext;
    (window as any).webkitAudioContext = GuardedAudioContext;
  }

  // 3. Guard SpeechRecognition
  if (OriginalSpeechRecognition) {
    const GuardedSpeechRecognition = function(this: any) {
        if (!userIntentFlag) {
            const error = "[GUARD_VIOLATION] SpeechRecognition initialized without direct user action. Access blocked.";
            console.error(error);
            throw new Error(error);
        }
        return new OriginalSpeechRecognition();
    } as any;

    GuardedSpeechRecognition.prototype = OriginalSpeechRecognition.prototype;
    (window as any).SpeechRecognition = GuardedSpeechRecognition;
    (window as any).webkitSpeechRecognition = GuardedSpeechRecognition;
  }

  devLog("[MediaGuard] Platform enforcement active. Startup requests blocked.");
};
