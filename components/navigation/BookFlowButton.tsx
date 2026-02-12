import React from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { ChevronUpIcon } from '../icons/ChevronUpIcon.tsx';

const BookFlowButton: React.FC = () => {
    const { navigate, currentView } = useNavigation();

    const handlePress = () => {
        navigate({ type: 'immersive', id: 'discoveryFlow', params: { from: currentView } });
    };

    return (
        <div 
            className="fixed bottom-[98px] left-0 right-0 z-20 flex justify-center pointer-events-none"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <button
                onClick={handlePress}
                className="
                    flex items-center gap-2 px-6 py-3
                    bg-gray-100/80 dark:bg-slate-800/80 backdrop-blur-md 
                    shadow-xl shadow-primary/10 dark:shadow-black/40 
                    border border-black/5 dark:border-white/10 
                    text-slate-800 dark:text-white 
                    pointer-events-auto 
                    transition-all duration-300 ease-in-out
                    hover:-translate-y-1 hover:scale-105 hover:shadow-2xl hover:shadow-primary/20
                    active:scale-100
                    rounded-full"
                aria-label="Open BookFlow"
            >
                <ChevronUpIcon className="h-5 w-5 text-accent" />
                <BilingualText className="font-bold text-lg">BookFlow</BilingualText>
            </button>
        </div>
    );
};

export default BookFlowButton;