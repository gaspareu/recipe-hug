import { useRef, useCallback, useState } from 'react';

interface UseSwipeCloseOptions {
  onClose: () => void;
  direction?: 'left' | 'right';
  threshold?: number;
}

export function useSwipeClose({ 
  onClose, 
  direction = 'right', 
  threshold = 100 
}: UseSwipeCloseOptions) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const [translateX, setTranslateX] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
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
      if (direction === 'right' && deltaX > 0) {
        setTranslateX(deltaX);
      } else if (direction === 'left' && deltaX < 0) {
        setTranslateX(deltaX);
      }
    }
  }, [direction]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) {
      setTranslateX(0);
      return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - touchStartX.current;

    const isSwipeRight = deltaX > threshold;
    const isSwipeLeft = deltaX < -threshold;

    if (
      (direction === 'right' && isSwipeRight) ||
      (direction === 'left' && isSwipeLeft)
    ) {
      onClose();
    }

    // Reset
    setTranslateX(0);
    touchStartX.current = null;
    touchStartY.current = null;
    isHorizontalSwipe.current = null;
  }, [onClose, direction, threshold]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    style: {
      transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
      transition: translateX === 0 ? 'transform 0.2s ease-out' : undefined,
    },
  };
}
