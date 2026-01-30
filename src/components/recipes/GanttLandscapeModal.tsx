import { useState, useRef, useEffect } from 'react';
import { X, Clock, GitBranch, Play, Pause, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Step } from '@/types/recipe';

interface TimelineStep {
  order: number;
  duration_minutes: number;
  parallel_with: number[];
  start_offset: number;
  is_passive?: boolean;
}

interface TimelineData {
  analyzed_at: string;
  total_time: number;
  steps: TimelineStep[];
}

interface GanttLandscapeModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps: Step[];
  timelineData: TimelineData;
}

// Active task colors (solid, vibrant)
const ACTIVE_COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
];

// Passive task styles (striped pattern)
const PASSIVE_COLORS = [
  'bg-primary/60',
  'bg-blue-500/60',
  'bg-emerald-500/60',
  'bg-amber-500/60',
  'bg-rose-500/60',
  'bg-violet-500/60',
];

export function GanttLandscapeModal({ isOpen, onClose, steps, timelineData }: GanttLandscapeModalProps) {
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Lock scroll
      document.body.style.overflow = 'hidden';
      
      const updateSize = () => {
        if (containerRef.current) {
          setContainerSize({
            width: containerRef.current.offsetWidth,
            height: containerRef.current.offsetHeight,
          });
        }
      };
      
      updateSize();
      window.addEventListener('resize', updateSize);
      
      return () => {
        window.removeEventListener('resize', updateSize);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
  const totalTime = timelineData.total_time;
  
  // Group steps into "lanes" based on parallelism
  const lanes: TimelineStep[][] = [];
  const stepToLane = new Map<number, number>();

  for (const timelineStep of timelineData.steps) {
    let assignedLane = -1;
    
    for (const parallelOrder of timelineStep.parallel_with) {
      if (stepToLane.has(parallelOrder)) {
        break;
      }
    }

    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const canFit = lane.every(existingStep => {
        const existingEnd = existingStep.start_offset + existingStep.duration_minutes;
        const newEnd = timelineStep.start_offset + timelineStep.duration_minutes;
        return timelineStep.start_offset >= existingEnd || newEnd <= existingStep.start_offset;
      });
      if (canFit) {
        assignedLane = i;
        break;
      }
    }

    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push([]);
    }

    lanes[assignedLane].push(timelineStep);
    stepToLane.set(timelineStep.order, assignedLane);
  }

  // Calculate dimensions for landscape view
  const headerHeight = 48;
  const legendHeight = 80;
  const timeAxisHeight = 32;
  const availableWidth = containerSize.width - 80; // Padding + lane labels
  const availableHeight = containerSize.height - headerHeight - legendHeight - timeAxisHeight - 40;
  const laneHeight = Math.min(Math.max(availableHeight / Math.max(lanes.length, 1), 40), 60);
  const pixelsPerMinute = totalTime > 0 ? availableWidth / totalTime : 8;

  // Time markers
  const markerInterval = totalTime > 60 ? 15 : totalTime > 30 ? 10 : 5;
  const timeMarkers: number[] = [];
  for (let t = 0; t <= totalTime; t += markerInterval) {
    timeMarkers.push(t);
  }
  if (timeMarkers[timeMarkers.length - 1] < totalTime) {
    timeMarkers.push(totalTime);
  }

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h${m}` : `${h}h`;
  };

  const selectedStepData = selectedStep !== null 
    ? sortedSteps.find(s => s.order === selectedStep) 
    : null;
  const selectedTimelineStep = selectedStep !== null 
    ? timelineData.steps.find(ts => ts.order === selectedStep) 
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0" style={{ height: headerHeight }}>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <span className="font-semibold">Timeline interactive</span>
          <span className="text-sm text-muted-foreground">({formatTime(totalTime)})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden landscape:flex items-center gap-1 text-xs text-muted-foreground">
            <Smartphone className="h-4 w-4 rotate-90" />
            Mode paysage
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Gantt Chart Area */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-4">
        <div className="h-full flex flex-col">
          {/* Time axis */}
          <div className="relative ml-12 mb-2" style={{ height: timeAxisHeight }}>
            {timeMarkers.map((t) => (
              <div
                key={t}
                className="absolute text-xs text-muted-foreground whitespace-nowrap"
                style={{ left: `${t * pixelsPerMinute}px` }}
              >
                {formatTime(t)}
              </div>
            ))}
          </div>

          {/* Lanes */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {lanes.map((lane, laneIndex) => (
              <div key={laneIndex} className="flex items-center gap-2">
                {/* Lane label */}
                <div className="w-10 text-sm text-muted-foreground text-right shrink-0 font-medium">
                  Voie {laneIndex + 1}
                </div>
                
                {/* Lane timeline */}
                <div 
                  className="relative bg-muted/30 rounded-lg flex-1"
                  style={{ height: laneHeight }}
                >
                  {/* Grid lines */}
                  {timeMarkers.map(t => (
                    <div
                      key={t}
                      className="absolute top-0 bottom-0 w-px bg-border/50"
                      style={{ left: `${t * pixelsPerMinute}px` }}
                    />
                  ))}

                  {/* Steps in this lane */}
                  {lane.map(timelineStep => {
                    const step = sortedSteps.find(s => s.order === timelineStep.order);
                    const colorIndex = (timelineStep.order - 1) % ACTIVE_COLORS.length;
                    const isPassive = timelineStep.is_passive ?? false;
                    const bgColor = isPassive ? PASSIVE_COLORS[colorIndex] : ACTIVE_COLORS[colorIndex];
                    const isSelected = selectedStep === timelineStep.order;
                    const stepWidth = Math.max(timelineStep.duration_minutes * pixelsPerMinute, 40);
                    
                    return (
                      <button
                        key={timelineStep.order}
                        onClick={() => setSelectedStep(isSelected ? null : timelineStep.order)}
                        className={cn(
                          'absolute top-2 bottom-2 rounded-lg flex items-center px-3 transition-all',
                          bgColor,
                          isPassive && 'border-2 border-dashed border-white/40',
                          isSelected && 'ring-2 ring-white ring-offset-2 ring-offset-background scale-105 z-10',
                          'hover:brightness-110 active:scale-95'
                        )}
                        style={{
                          left: `${timelineStep.start_offset * pixelsPerMinute}px`,
                          width: `${stepWidth}px`,
                        }}
                      >
                        <span className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                          {isPassive ? <Pause className="h-4 w-4 shrink-0" /> : <Play className="h-4 w-4 shrink-0" />}
                          <span className="truncate">
                            {stepWidth > 80 ? `${timelineStep.order}. ${step?.text.slice(0, 20)}...` : timelineStep.order}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected step details / Legend */}
      <div className="border-t bg-card px-4 py-3 shrink-0" style={{ minHeight: legendHeight }}>
        {selectedStepData && selectedTimelineStep ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'w-6 h-6 rounded flex items-center justify-center',
                  selectedTimelineStep.is_passive ? PASSIVE_COLORS[(selectedStep! - 1) % PASSIVE_COLORS.length] : ACTIVE_COLORS[(selectedStep! - 1) % ACTIVE_COLORS.length]
                )}>
                  {selectedTimelineStep.is_passive ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white" />}
                </span>
                <span className="font-semibold">Étape {selectedStep}</span>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  selectedTimelineStep.is_passive ? 'bg-muted text-muted-foreground' : 'bg-primary/20 text-primary'
                )}>
                  {selectedTimelineStep.is_passive ? 'Passive' : 'Active'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{selectedStepData.text}</p>
            </div>
            <div className="flex items-center gap-4 text-sm shrink-0">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatTime(selectedTimelineStep.duration_minutes)}</span>
              </div>
              {selectedTimelineStep.parallel_with.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <span>Parallèle: {selectedTimelineStep.parallel_with.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-primary rounded flex items-center justify-center">
                  <Play className="h-3 w-3 text-white" />
                </div>
                <span className="text-muted-foreground">Tâche active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-primary/60 border-2 border-dashed border-white/40 rounded flex items-center justify-center">
                  <Pause className="h-3 w-3 text-white" />
                </div>
                <span className="text-muted-foreground">Tâche passive</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Touchez une étape pour voir les détails</p>
          </div>
        )}
      </div>
    </div>
  );
}
