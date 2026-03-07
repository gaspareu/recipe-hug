import { cn } from '@/lib/utils';

interface SoundWaveIndicatorProps {
  className?: string;
  barCount?: number;
}

export function SoundWaveIndicator({ className, barCount = 4 }: SoundWaveIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-[3px] h-5", className)}>
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-primary-foreground animate-sound-wave"
          style={{
            animationDelay: `${i * 0.15}s`,
            height: '60%',
          }}
        />
      ))}
    </div>
  );
}
