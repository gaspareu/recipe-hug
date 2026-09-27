import { ReactNode, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  description,
  icon,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const descriptionId = useId();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-xs">
        <h2 aria-label={title}>
          <CollapsibleTrigger aria-label={title} aria-describedby={description ? descriptionId : undefined} className="flex w-full items-center justify-between p-6 text-left hover:bg-muted/50 transition-colors rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex items-center gap-3">
              {icon && <span className="text-primary">{icon}</span>}
              <span className="flex flex-col">
                <span className="font-semibold leading-none tracking-tight">{title}</span>
                {description && (
                  <span id={descriptionId} className="text-sm text-muted-foreground mt-1">{description}</span>
                )}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-5 w-5 text-muted-foreground transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent>
          <div className="px-6 pb-6 pt-0">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
