import React from 'react';

interface BookIconProps {
  className?: string;
}

export const BookIcon: React.FC<BookIconProps> = ({ className = '' }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 5.5C4 4.67 4.67 4 5.5 4H18a2 2 0 0 1 2 2v12.5a1.5 1.5 0 0 1-1.5 1.5H6a2 2 0 0 0-2 2V5.5Z" />
      <path d="M6 18h12" />
    </svg>
  );
};

export default BookIcon;