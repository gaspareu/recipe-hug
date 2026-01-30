import { useState, useRef, useEffect } from 'react';
import { Loader2, Clock, GitBranch, RefreshCw, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

interface RecipeGanttChartProps {
  recipeId: string;
  steps: Step[];
  timelineData: TimelineData | null;
  onTimelineUpdate: () => void;
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

export function RecipeGanttChart({ recipeId, steps, timelineData, onTimelineUpdate }: RecipeGanttChartProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [timelineData]);

  const analyzeTimeline = async () => {
    setIsAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Non authentifié');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-recipe-timeline`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ recipeId, steps }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Échec de l\'analyse');
      }

      toast.success('Timeline analysée !', {
        description: 'Les durées et dépendances ont été estimées par l\'IA.'
      });
      onTimelineUpdate();
    } catch (error) {
      console.error('Error analyzing timeline:', error);
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Impossible d\'analyser la timeline'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!timelineData) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Timeline de cuisson
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-4">
              Visualisez les étapes en graphe de Gantt avec estimation des durées et parallélisme.
            </p>
            <Button onClick={analyzeTimeline} disabled={isAnalyzing || steps.length === 0}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyse en cours...
                </>
              ) : (
                <>
                  <GitBranch className="h-4 w-4 mr-2" />
                  Analyser la timeline
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
  const totalTime = timelineData.total_time;
  
  // Calculate scale to fill container width (minus lane label width and right padding)
  const laneLabel = 24; // Lane label width
  const rightPadding = 40; // Extra space for last time marker
  const laneWidth = Math.max(containerWidth - laneLabel - rightPadding, 100);
  const pixelsPerMinute = totalTime > 0 ? laneWidth / totalTime : 6;

  // Group steps into "lanes" based on parallelism
  const lanes: TimelineStep[][] = [];
  const stepToLane = new Map<number, number>();

  for (const timelineStep of timelineData.steps) {
    let assignedLane = -1;
    
    // Check if this step can share a lane with parallel steps
    for (const parallelOrder of timelineStep.parallel_with) {
      if (stepToLane.has(parallelOrder)) {
        // Don't share a lane, but start looking for a different one
        break;
      }
    }

    // Find first available lane where this step fits
    for (let i = 0; i < lanes.length; i++) {
      const lane = lanes[i];
      const canFit = lane.every(existingStep => {
        const existingEnd = existingStep.start_offset + existingStep.duration_minutes;
        const newEnd = timelineStep.start_offset + timelineStep.duration_minutes;
        // No overlap
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

  // Create time markers - adaptive based on total time
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-base flex-wrap">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">Timeline</span>
            <span className="text-sm font-normal text-muted-foreground whitespace-nowrap">
              ({formatTime(totalTime)})
            </span>
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={analyzeTimeline} 
            disabled={isAnalyzing}
            title="Ré-analyser"
            className="shrink-0"
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        <div ref={containerRef} className="w-full">
          <div className="pb-4">
            {/* Time axis */}
            <div className="flex items-center h-6 mb-2 ml-6 relative">
              {timeMarkers.map((t) => (
                <div
                  key={t}
                  className="absolute text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap"
                  style={{ left: `${t * pixelsPerMinute}px` }}
                >
                  {formatTime(t)}
                </div>
              ))}
            </div>

            {/* Lanes */}
            <div className="space-y-1.5">
              {lanes.map((lane, laneIndex) => (
                <div key={laneIndex} className="flex items-center gap-1.5">
                  {/* Lane label */}
                  <div className="w-4 text-[10px] text-muted-foreground text-right shrink-0">
                    {laneIndex + 1}
                  </div>
                  
                  {/* Lane timeline */}
                  <div 
                    className="relative h-8 sm:h-10 bg-muted/30 rounded-md flex-1"
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
                    <TooltipProvider>
                      {lane.map(timelineStep => {
                        const step = sortedSteps.find(s => s.order === timelineStep.order);
                        const colorIndex = (timelineStep.order - 1) % ACTIVE_COLORS.length;
                        const isPassive = timelineStep.is_passive ?? false;
                        const bgColor = isPassive ? PASSIVE_COLORS[colorIndex] : ACTIVE_COLORS[colorIndex];
                        
                        return (
                          <Tooltip key={timelineStep.order}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  'absolute top-1 bottom-1 rounded-md flex items-center px-2 cursor-pointer transition-opacity hover:opacity-90',
                                  bgColor,
                                  isPassive && 'border-2 border-dashed border-white/40'
                                )}
                                style={{
                                  left: `${timelineStep.start_offset * pixelsPerMinute}px`,
                                  width: `${Math.max(timelineStep.duration_minutes * pixelsPerMinute, 24)}px`,
                                }}
                              >
                                <span className="text-xs font-medium text-white truncate flex items-center gap-1">
                                  {isPassive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                                  {timelineStep.order}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-medium flex items-center gap-1.5">
                                  Étape {timelineStep.order}
                                  <span className={cn(
                                    'text-[10px] px-1.5 py-0.5 rounded',
                                    isPassive ? 'bg-muted text-muted-foreground' : 'bg-primary/20 text-primary'
                                  )}>
                                    {isPassive ? 'Passive' : 'Active'}
                                  </span>
                                </p>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {step?.text}
                                </p>
                                <div className="flex items-center gap-2 text-xs">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(timelineStep.duration_minutes)}
                                  {timelineStep.parallel_with.length > 0 && (
                                    <>
                                      <span className="text-muted-foreground">•</span>
                                      <GitBranch className="h-3 w-3" />
                                      Parallèle avec {timelineStep.parallel_with.join(', ')}
                                    </>
                                  )}
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </TooltipProvider>
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t space-y-3">
              {/* Task type legend */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-primary rounded-sm flex items-center justify-center">
                    <Play className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span className="text-muted-foreground">Tâche active</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-primary/60 border-2 border-dashed border-white/40 rounded-sm flex items-center justify-center">
                    <Pause className="h-2.5 w-2.5 text-white" />
                  </div>
                  <span className="text-muted-foreground">Tâche passive (parallélisme possible)</span>
                </div>
              </div>
              
              {/* Steps legend */}
              <div className="flex flex-wrap gap-2 sm:gap-3">
                {sortedSteps.map((step, i) => {
                  const timelineStep = timelineData.steps.find(ts => ts.order === step.order);
                  const colorIndex = i % ACTIVE_COLORS.length;
                  const isPassive = timelineStep?.is_passive ?? false;
                  
                  return (
                    <div key={step.order} className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs">
                      <div className={cn(
                        'w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm shrink-0',
                        isPassive ? PASSIVE_COLORS[colorIndex] : ACTIVE_COLORS[colorIndex],
                        isPassive && 'border border-dashed border-white/40'
                      )} />
                      <span className="text-muted-foreground truncate max-w-[80px] sm:max-w-[120px]">
                        {step.order}. {step.text.slice(0, 15)}...
                      </span>
                      {timelineStep && (
                        <span className="text-muted-foreground/70 whitespace-nowrap">
                          ({formatTime(timelineStep.duration_minutes)})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
