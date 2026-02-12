import React from 'react';

export const BookToAppIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...props}>
    {/* Base shape: rounded square for app icon */}
    <g className="animate-book-morph">
        <rect x="15" y="15" width="70" height="70" rx="15" fill="none" stroke="currentColor" strokeWidth="2.5" />

        {/* Book pages emerging */}
        <g className="animate-page-flutter" style={{ animationDelay: '0.2s' }}>
            <path d="M 40 25 C 45 35, 45 65, 40 75" fill="none" stroke="currentColor" strokeWidth="2" />
        </g>
        <g className="animate-page-flutter" style={{ animationDelay: '0.4s' }}>
            <path d="M 45 25 C 52 35, 52 65, 45 75" fill="none" stroke="currentColor" strokeWidth="2" />
        </g>
        <g className="animate-page-flutter" style={{ animationDelay: '0.6s' }}>
            <path d="M 50 25 C 59 35, 59 65, 50 75" fill="none" stroke="currentColor" strokeWidth="2" />
        </g>
        
        {/* Book cover part */}
        <path d="M 65 25 L 55 25 C 65 45, 65 55, 55 75 L 65 75 Z" fill="currentColor" />
    </g>
  </svg>
);
