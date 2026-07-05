import { Badge } from '@/components/ui/badge';

interface CapabilityBadgeProps {
  capability: string;
}

const CAPABILITY_LABELS: Record<string, string> = {
  text: 'Texte',
  streaming: 'Streaming',
  vision: 'Vision',
  tools: 'Outils',
  image_generation: 'Génération image',
};

// Badge traduisant une capacité de modèle (texte, streaming, vision, outils, image).
export const CapabilityBadge = ({ capability }: CapabilityBadgeProps) => {
  return (
    <Badge variant="secondary" className="text-xs">
      {CAPABILITY_LABELS[capability] || capability}
    </Badge>
  );
};
