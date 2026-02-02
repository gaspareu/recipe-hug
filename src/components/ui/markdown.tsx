import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * A secure wrapper around ReactMarkdown that ensures best practices
 * for security and accessibility.
 */
export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={cn(
      "prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground prose-li:text-foreground",
      className
    )}>
      <ReactMarkdown
        components={{
          // Ensure all external links are secure and don't leak information
          a: ({ node, ...props }) => {
            const isExternal = props.href?.startsWith('http');
            return (
              <a
                {...props}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
