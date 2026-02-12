import React from 'react';

export const BasketIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  // FIX: Corrected a typo in the viewBox attribute. It was malformed, causing multiple parsing errors.
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m5 11 4-7"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.6-7.4"/><path d="M9 11v6"/><path d="M15 11v6"/>
  </svg>
);
