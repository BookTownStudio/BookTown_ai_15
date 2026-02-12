
import React, { useState } from 'react';
import { StarIcon } from '../icons/StarIcon.tsx';
import { generateColorFromText, cn } from '../../lib/utils.ts';

interface BookAttachmentCardProps {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCover: string;
  bookRating: number;
  onPress: () => void;
}

const Stars: React.FC<{ rating: number }> = ({ rating }) => {
    const displayRating = Math.round(rating);
    return (
        <div className="flex items-center" aria-label={`Rating: ${rating} out of 5 stars`}>
            {Array.from({ length: 5 }).map((_, i) => (
                <StarIcon key={i} className={`h-4 w-4 ${i < displayRating ? 'text-yellow-400' : 'text-slate-500'}`} />
            ))}
        </div>
    );
};

const BookAttachmentCard: React.FC<BookAttachmentCardProps> = ({ bookTitle, bookAuthor, bookCover, bookRating, onPress }) => {
    const [imageError, setImageError] = useState(false);

    const hasImage = bookCover && !imageError;
    const fallbackColor = generateColorFromText(bookTitle);

    const backgroundStyle = hasImage ? {
        backgroundImage: `url(${bookCover})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    } : undefined;
    
    const overlayStyle = {
        background: hasImage 
            ? 'linear-gradient(180deg, rgba(0,0,0,0.3) 20%, rgba(0,0,0,0.75) 90%)'
            : 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)',
        backdropFilter: hasImage ? 'blur(8px)' : 'none',
    };

    return (
        <button
            onClick={onPress}
            className={cn(
                "relative w-full text-left mt-3 rounded-card overflow-hidden text-white shadow-lg shadow-black/30 group",
                !hasImage && fallbackColor
            )}
            style={backgroundStyle}
        >
            <div style={overlayStyle} className="absolute inset-0"></div>
            
            <div className="relative z-10 p-4 flex items-center gap-4">
                {hasImage ? (
                    <img 
                        src={bookCover} 
                        alt={bookTitle} 
                        className="w-24 h-auto aspect-[2/3] rounded-md shadow-lg shadow-black/40 transition-transform duration-300 group-hover:scale-105 object-cover"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div className={cn("w-24 h-auto aspect-[2/3] rounded-md shadow-lg shadow-black/40 flex items-center justify-center p-2 text-center bg-white/10 backdrop-blur-md border border-white/20")}>
                        <span className="text-xs font-bold line-clamp-3 leading-tight">{bookTitle}</span>
                    </div>
                )}
                
                <div className="flex-1 self-stretch flex flex-col justify-between py-1">
                    <div>
                        <h3 className="text-xl font-bold leading-tight line-clamp-2" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                            {bookTitle}
                        </h3>
                        <p className="text-sm text-white/80 mt-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                            {bookAuthor}
                        </p>
                    </div>
                    <div className="mt-2">
                        <Stars rating={bookRating} />
                    </div>
                </div>
            </div>
        </button>
    );
};

export default BookAttachmentCard;
