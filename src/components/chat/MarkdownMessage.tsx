import React, { Suspense, lazy, memo } from 'react';

// Lazy-load react-markdown to reduce initial bundle size
const ReactMarkdown = lazy(() => import('react-markdown'));

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * A performance-optimized wrapper for ReactMarkdown that lazy-loads the library.
 * It is memoized to prevent unnecessary re-renders when the content hasn't changed.
 */
export const MarkdownMessage = memo(({ content, className }: MarkdownMessageProps) => {
  return (
    <Suspense
      fallback={
        <div className={className}>
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        </div>
      }
    >
      <div className={className}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </Suspense>
  );
});

MarkdownMessage.displayName = 'MarkdownMessage';
