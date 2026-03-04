import { devLog } from '../logging/devLog';
import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type DeviceType = 'android-chrome' | 'ios-safari' | 'desktop-pwa' | 'fallback';

export const useInstallPrompt = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [deviceType, setDeviceType] = useState<DeviceType>('fallback');
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handler);

        const userAgent = window.navigator.userAgent.toLowerCase();
        // Standard check for iOS
        const isIOS = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        // Check for Safari on a non-Chrome/Android browser
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        const isAndroid = /android/.test(userAgent);
        const isChrome = /chrome/.test(userAgent);
        
        // Check if running as a PWA
        const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
        setIsStandalone(standalone);

        if (standalone) {
             // Already installed, no need to determine type for prompt
        } else if (isAndroid && isChrome) {
            setDeviceType('android-chrome');
// FIX: Cast window to 'any' to access the non-standard MSStream property, resolving the TypeScript error.
        } else if (isIOS && !(window as any).MSStream && isSafari) { // !(window as any).MSStream is another check for non-IE browsers
            setDeviceType('ios-safari');
        } else if (!isIOS && !isAndroid) {
            // A rough check for desktop browsers that might support PWA installation
            setDeviceType('desktop-pwa');
        } else {
            setDeviceType('fallback');
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    const triggerPrompt = async () => {
        if (deferredPrompt) {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            devLog(`User response to the install prompt: ${outcome}`);
            setDeferredPrompt(null);
        }
    };

    return { canPrompt: !!deferredPrompt, triggerPrompt, deviceType, isStandalone };
};