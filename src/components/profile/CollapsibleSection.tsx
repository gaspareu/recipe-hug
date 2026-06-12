import { ReactNode, useState } from 'react';
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
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-6 text-left hover:bg-muted/50 transition-colors rounded-lg">
          <div className="flex items-center gap-3">
            {icon && <span className="text-primary">{icon}</span>}
            <div>
              <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
              {description && (
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-6 pt-0">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
