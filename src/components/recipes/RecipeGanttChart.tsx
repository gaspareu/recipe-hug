import { useState } from 'react';
import { Loader2, Clock, GitBranch, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Step } from '@/types/recipe';

interface TimelineStep {
  order: number;
  duration_minutes: number;
  parallel_with: number[];
  start_offset: number;
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

const COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-500',
  'bg-orange-500',
];

export function RecipeGanttChart({ recipeId, steps, timelineData, onTimelineUpdate }: RecipeGanttChartProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
  const pixelsPerMinute = 8; // Scale factor
  const minWidth = Math.max(totalTime * pixelsPerMinute, 400);

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

  // Create time markers
  const timeMarkers: number[] = [];
  for (let t = 0; t <= totalTime; t += 10) {
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
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Timeline de cuisson
            <span className="text-sm font-normal text-muted-foreground">
              ({formatTime(totalTime)} au total)
            </span>
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={analyzeTimeline} 
            disabled={isAnalyzing}
            title="Ré-analyser"
          >
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="min-w-fit pb-4" style={{ width: `${minWidth + 80}px` }}>
            {/* Time axis */}
            <div className="flex items-center h-6 mb-2 ml-8 relative">
              {timeMarkers.map((t, i) => (
                <div
                  key={t}
                  className="absolute text-xs text-muted-foreground"
                  style={{ left: `${t * pixelsPerMinute}px` }}
                >
                  {formatTime(t)}
                </div>
              ))}
            </div>

            {/* Lanes */}
            <div className="space-y-2">
              {lanes.map((lane, laneIndex) => (
                <div key={laneIndex} className="flex items-center gap-2">
                  {/* Lane label */}
                  <div className="w-6 text-xs text-muted-foreground text-right shrink-0">
                    {laneIndex + 1}
                  </div>
                  
                  {/* Lane timeline */}
                  <div 
                    className="relative h-10 bg-muted/30 rounded-md"
                    style={{ width: `${totalTime * pixelsPerMinute}px` }}
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
                        const colorIndex = (timelineStep.order - 1) % COLORS.length;
                        
                        return (
                          <Tooltip key={timelineStep.order}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  'absolute top-1 bottom-1 rounded-md flex items-center px-2 cursor-pointer transition-opacity hover:opacity-90',
                                  COLORS[colorIndex]
                                )}
                                style={{
                                  left: `${timelineStep.start_offset * pixelsPerMinute}px`,
                                  width: `${Math.max(timelineStep.duration_minutes * pixelsPerMinute, 24)}px`,
                                }}
                              >
                                <span className="text-xs font-medium text-white truncate">
                                  {timelineStep.order}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="space-y-1">
                                <p className="font-medium">Étape {timelineStep.order}</p>
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
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
              {sortedSteps.map((step, i) => {
                const timelineStep = timelineData.steps.find(ts => ts.order === step.order);
                const colorIndex = i % COLORS.length;
                
                return (
                  <div key={step.order} className="flex items-center gap-1.5 text-xs">
                    <div className={cn('w-3 h-3 rounded-sm', COLORS[colorIndex])} />
                    <span className="text-muted-foreground truncate max-w-[120px]">
                      {step.order}. {step.text.slice(0, 20)}...
                    </span>
                    {timelineStep && (
                      <span className="text-muted-foreground/70">
                        ({formatTime(timelineStep.duration_minutes)})
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
