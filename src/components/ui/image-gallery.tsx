'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { getPlaceholderForRecipe } from '@/lib/recipePlaceholder';

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
}

export function ImageGallery({ items, onToggleFavorite, isTogglingFavorite }: ImageGalleryProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <AnimatedImage
          key={item.id}
          id={item.id}
          alt={item.title}
          src={item.imageUrl || getPlaceholderForRecipe(item.id)}
          fallback={getPlaceholderForRecipe(item.id)}
          title={item.title}
          isFavorite={item.isFavorite}
          onToggleFavorite={onToggleFavorite}
          isTogglingFavorite={isTogglingFavorite}
        />
      ))}
    </div>
  );
}

interface AnimatedImageProps {
  id: string;
  alt: string;
  src: string;
  fallback: string;
  title: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string, isFavorite: boolean) => void;
  isTogglingFavorite?: boolean;
}

const DOUBLE_TAP_MS = 250;

function AnimatedImage({
  id,
  alt,
  src,
  fallback,
  title,
  isFavorite,
  onToggleFavorite,
  isTogglingFavorite,
}: AnimatedImageProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = React.useState(true);
  const [imgSrc, setImgSrc] = React.useState(src);
  const [showBurst, setShowBurst] = React.useState(false);
  const lastTapRef = React.useRef(0);
  const tapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedRef = React.useRef(false);

  React.useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
  }, []);

  // Réchauffe le chunk lazy de la page détail : évite le flash du fallback
  // Suspense et garantit une transition d'ouverture fluide dès le premier tap.
  const prefetch = () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    import('@/pages/RecipeDetail');
  };

  const goToDetail = () => navigate(`/recipes/${id}`);

  const triggerLike = () => {
    if (onToggleFavorite && !isTogglingFavorite && !isFavorite) {
      onToggleFavorite(id, true);
    }
    setShowBurst(true);
    window.setTimeout(() => setShowBurst(false), 800);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Préserve l'ouverture dans un nouvel onglet / clic modifié.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();

    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      // Double tap → like, on annule la navigation différée.
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      lastTapRef.current = 0;
      triggerLike();
      return;
    }
    lastTapRef.current = now;
    tapTimerRef.current = setTimeout(() => {
      lastTapRef.current = 0;
      goToDetail();
    }, DOUBLE_TAP_MS);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleFavorite && !isTogglingFavorite) {
      onToggleFavorite(id, !isFavorite);
    }
  };

  return (
    <a
      href={`/recipes/${id}`}
      onClick={handleClick}
      onMouseEnter={prefetch}
      onTouchStart={prefetch}
      style={{ touchAction: 'manipulation' }}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
    >
      <div className="relative overflow-hidden rounded-xl bg-muted shadow-sm transition-shadow duration-300 group-hover:shadow-lg">
        <AspectRatio ratio={1}>
          <img
            src={imgSrc}
            alt={alt}
            loading="lazy"
            onLoad={() => setIsLoading(false)}
            onError={() => setImgSrc(fallback)}
            className={cn(
              'h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-[1.04]',
              isLoading ? 'scale-105 opacity-0 blur-md' : 'scale-100 opacity-100 blur-0',
            )}
          />

          {/* Dégradé bas (titre lisible) */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-100 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100" />

          {/* Titre : visible sur mobile, révélé au survol sur desktop */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 translate-y-0 opacity-100 transition-all duration-300 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
            <p className="line-clamp-2 font-solitreo text-xs font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] sm:text-sm">
              {title}
            </p>
          </div>

          {/* Cœur central (double-tap) */}
          {showBurst && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Heart className="h-1/3 w-1/3 animate-like-burst fill-white text-white drop-shadow-lg" />
            </div>
          )}

          {/* Bouton favori */}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={handleFavoriteClick}
              disabled={isTogglingFavorite}
              aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm transition-colors hover:bg-black/50"
            >
              <Heart
                className={cn(
                  'h-4 w-4 transition-colors',
                  isFavorite ? 'animate-favorite-pop fill-red-500 text-red-500' : 'text-white',
                )}
              />
            </button>
          )}
        </AspectRatio>
      </div>
    </a>
  );
}
