'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useInView } from 'framer-motion';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';

export interface GalleryItem {
  id: string;
  title: string;
  imageUrl: string | null;
  isFavorite?: boolean;
}

interface ImageGalleryProps {
  items: GalleryItem[];
  onToggleFavorite?: (id: string, isFavorite: boolean) => void;
  isTogglingFavorite?: boolean;
  placeholder?: string;
}

export function ImageGallery({ items, onToggleFavorite, isTogglingFavorite, placeholder = '/placeholder.svg' }: ImageGalleryProps) {
  // Distribute items across 3 columns
  const columns: GalleryItem[][] = [[], [], []];
  items.forEach((item, index) => {
    columns[index % 3].push(item);
  });

  return (
    <div className="w-full">
      <div className="flex gap-0.5">
        {columns.map((column, colIndex) => (
          <div key={colIndex} className="flex flex-1 flex-col gap-0.5">
            {column.map((item) => (
              <AnimatedImage
                key={item.id}
                id={item.id}
                alt={item.title}
                src={item.imageUrl || placeholder}
                placeholder={placeholder}
                title={item.title}
                isFavorite={item.isFavorite}
                onToggleFavorite={onToggleFavorite}
                isTogglingFavorite={isTogglingFavorite}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AnimatedImageProps {
  id: string;
  alt: string;
  src: string;
  className?: string;
  placeholder?: string;
  title: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string, isFavorite: boolean) => void;
  isTogglingFavorite?: boolean;
}

function AnimatedImage({ 
  id, 
  alt, 
  src, 
  placeholder, 
  title, 
  isFavorite, 
  onToggleFavorite,
  isTogglingFavorite 
}: AnimatedImageProps) {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once: true });
  const [isLoading, setIsLoading] = React.useState(true);
  const [imgSrc, setImgSrc] = React.useState(src);

  const handleError = () => {
    if (placeholder) {
      setImgSrc(placeholder);
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleFavorite && !isTogglingFavorite) {
      onToggleFavorite(id, !isFavorite);
    }
  };

  return (
    <Link to={`/recipe/${id}`} className="block">
      <AspectRatio ratio={1} ref={ref} className="relative overflow-hidden bg-muted">
        <img
          src={imgSrc}
          alt={alt}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-all duration-700',
            isInView ? 'scale-100 opacity-100 blur-0' : 'scale-110 opacity-0 blur-md',
            isLoading && 'animate-pulse'
          )}
          onLoad={() => setIsLoading(false)}
          loading="lazy"
          onError={handleError}
        />
        {/* Gradient overlay for title */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
        {/* Title */}
        <div className="absolute inset-x-0 bottom-0 p-2">
          <p className="text-xs font-medium text-white line-clamp-2 drop-shadow-md">
            {title}
          </p>
        </div>
        {/* Favorite button */}
        {onToggleFavorite && (
          <button
            onClick={handleFavoriteClick}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/30 backdrop-blur-sm transition-colors hover:bg-black/50"
            disabled={isTogglingFavorite}
          >
            <Heart
              className={cn(
                'h-4 w-4 transition-colors',
                isFavorite ? 'fill-red-500 text-red-500' : 'text-white'
              )}
            />
          </button>
        )}
      </AspectRatio>
    </Link>
  );
}
