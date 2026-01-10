import { useRef, useCallback } from 'react';

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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = Math.abs(touchEndY - touchStartY.current);

    // Only trigger if horizontal swipe is dominant (not scrolling vertically)
    if (deltaY > Math.abs(deltaX)) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }

    const isSwipeRight = deltaX > threshold;
    const isSwipeLeft = deltaX < -threshold;

    if (
      (direction === 'right' && isSwipeRight) ||
      (direction === 'left' && isSwipeLeft)
    ) {
      onClose();
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [onClose, direction, threshold]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}
