import React from 'react';

export const InfinityBookIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 50 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <g id="g-infinity-book-anim">
      <path id="infinity-path" d="M25,12 C25,7.5 30,4 35,4 C45,4 45,20 35,20 C30,20 25,16.5 25,12 Z M25,12 C25,16.5 20,20 15,20 C5,20 5,4 15,4 C20,4 25,7.5 25,12 Z" />
      <g transform="scale(0.4) translate(28, 6)">
        <path id="book-path-left" d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path id="book-path-right" d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </g>
    </g>
  </svg>
);
