import { useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseSwipeNavigationOptions {
  targetRoute: string;
  direction?: 'left' | 'right';
  threshold?: number;
}

export function useSwipeNavigation({ 
  targetRoute,
  direction = 'left', 
  threshold = 100 
}: UseSwipeNavigationOptions) {
  const navigate = useNavigate();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const [translateX, setTranslateX] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Ignore les touchers démarrant dans une zone avec son propre scroll horizontal
    if ((e.target as HTMLElement).closest('[data-no-swipe-nav]')) {
      touchStartX.current = null;
      touchStartY.current = null;
      isHorizontalSwipe.current = null;
      return;
    }

    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchCurrentX = e.touches[0].clientX;
    const touchCurrentY = e.touches[0].clientY;
    
    const deltaX = touchCurrentX - touchStartX.current;
    const deltaY = Math.abs(touchCurrentY - touchStartY.current);

    // Determine if this is a horizontal swipe on first significant movement
    if (isHorizontalSwipe.current === null && (Math.abs(deltaX) > 10 || deltaY > 10)) {
      isHorizontalSwipe.current = Math.abs(deltaX) > deltaY;
    }

    // Only apply translation for horizontal swipes in the correct direction
    if (isHorizontalSwipe.current) {
      if (direction === 'left' && deltaX < 0) {
        // Limit the translation to give a subtle feedback
        setTranslateX(Math.max(deltaX, -150));
      } else if (direction === 'right' && deltaX > 0) {
        setTranslateX(Math.min(deltaX, 150));
      }
    }
  }, [direction]);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null) {
      setTranslateX(0);
      return;
    }

    const shouldNavigate =
      (direction === 'left' && translateX < -threshold) ||
      (direction === 'right' && translateX > threshold);

    if (shouldNavigate) {
      navigate(targetRoute);
    }

    // Reset
    setTranslateX(0);
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = null;
  }, [navigate, targetRoute, direction, threshold, translateX]);

  const handleTouchCancel = useCallback(() => {
    // iOS peut interrompre un geste sans déclencher touchend (retour système,
    // notification, multi-touch...) : sans ce reset, translateX reste bloqué
    // et le décalage visuel de la page persiste indéfiniment.
    setTranslateX(0);
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = null;
  }, []);

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
    style: {
      transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
      transition: translateX === 0 ? 'transform 0.2s ease-out' : undefined,
    },
    isSwipping: translateX !== 0,
  };
}
