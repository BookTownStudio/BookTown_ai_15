import React from 'react';
import { BookTownLogoIcon } from '../icons/BookTownLogoIcon.tsx';

const AnimatedIntro = () => {
    return (
        <div className="flex flex-col items-center justify-center text-white font-inter">
            <BookTownLogoIcon className="w-72 h-auto" />
            <div className="flex items-center justify-between mt-8 text-3xl font-light tracking-wider w-72">
                <span className="animate-word-reveal" style={{ animationDelay: '1s' }}>read</span>
                <span className="animate-sphere-reveal" style={{ animationDelay: '1.5s' }}></span>
                <span className="animate-word-reveal" style={{ animationDelay: '2s' }}>write</span>
                <span className="animate-sphere-reveal" style={{ animationDelay: '2.5s' }}></span>
                <span className="animate-word-reveal" style={{ animationDelay: '3s' }}>think</span>
            </div>
        </div>
    );
};

export default AnimatedIntro;