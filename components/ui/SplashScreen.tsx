import React from 'react';
import { cn } from '../../lib/utils.ts';
import AnimatedIntro from '../content/AnimatedIntro.tsx';

interface SplashScreenProps {
  fading: boolean;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ fading }) => {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black',
         fading && 'animate-fade-out'
      )}
    >
      <AnimatedIntro />
    </div>
  );
};

export default SplashScreen;