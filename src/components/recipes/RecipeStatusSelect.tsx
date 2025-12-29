import { Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { RecipeStatus } from "@/types/recipe";

interface RecipeStatusSelectProps {
  status: RecipeStatus;
  onStatusChange: (status: RecipeStatus) => void;
  disabled?: boolean;
}

const statusConfig: Record<RecipeStatus, { label: string; className: string }> = {
  draft: { label: "Brouillon", className: "bg-background text-foreground border border-border" },
  tested: { label: "Testé", className: "bg-accent text-accent-foreground" },
  validated: { label: "Validé", className: "bg-primary text-primary-foreground" },
  archived: { label: "Archivé", className: "bg-destructive text-destructive-foreground" },
};

const statusOrder: RecipeStatus[] = ["draft", "tested", "validated", "archived"];

export function RecipeStatusSelect({ status, onStatusChange, disabled }: RecipeStatusSelectProps) {
  const config = statusConfig[status];

  return (
    <Select value={status} onValueChange={(value) => onStatusChange(value as RecipeStatus)} disabled={disabled}>
      <SelectTrigger className="w-auto h-auto border-0 p-0 shadow-none focus:ring-0 [&>svg]:hidden">
        <SelectValue>
          <Badge className={`cursor-pointer flex items-center gap-1 ${config.className}`}>
            <Pencil className="h-3 w-3" />
            {config.label}
          </Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {statusOrder.map((s) => {
          const cfg = statusConfig[s];
          return (
            <SelectItem key={s} value={s}>
              <Badge className={cfg.className}>{cfg.label}</Badge>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
