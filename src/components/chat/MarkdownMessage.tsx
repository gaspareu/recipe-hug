import ReactMarkdown from 'react-markdown';

interface MarkdownMessageProps {
  content: string;
}

export default function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground prose-li:text-foreground">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
