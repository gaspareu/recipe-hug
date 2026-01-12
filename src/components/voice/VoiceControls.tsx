import { Mic, MicOff, Volume2, VolumeX, AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface VoiceControlsProps {
  voiceEnabled: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  onToggleVoice: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
  partialTranscript?: string;
  className?: string;
  compact?: boolean;
}

export function VoiceControls({
  voiceEnabled,
  isSpeaking,
  isListening,
  onToggleVoice,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  partialTranscript,
  className,
  compact = false,
}: VoiceControlsProps) {
  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-2", className)}>
        {/* Voice mode toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              pressed={voiceEnabled}
              onPressedChange={onToggleVoice}
              size={compact ? "sm" : "default"}
              className={cn(
                "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
                voiceEnabled && "ring-2 ring-primary ring-offset-2"
              )}
            >
              {voiceEnabled ? (
                <Volume2 className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
              ) : (
                <VolumeX className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
              )}
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>
            {voiceEnabled ? 'Désactiver le mode vocal' : 'Activer le mode vocal'}
          </TooltipContent>
        </Tooltip>

        {voiceEnabled && (
          <>
            {/* Stop speaking button */}
            {isSpeaking && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size={compact ? "sm" : "default"}
                    onClick={onStopSpeaking}
                    className="animate-pulse"
                  >
                    <AudioLines className={cn(compact ? "h-4 w-4" : "h-5 w-5", "text-primary")} />
                    {!compact && <span className="ml-2">Arrêter</span>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Arrêter la lecture vocale</TooltipContent>
              </Tooltip>
            )}

            {/* Microphone button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isListening ? "default" : "outline"}
                  size={compact ? "sm" : "default"}
                  onClick={isListening ? onStopListening : onStartListening}
                  className={cn(isListening && "bg-destructive hover:bg-destructive/90")}
                >
                  {isListening ? (
                    <>
                      <MicOff className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
                      {!compact && <span className="ml-2">Arrêter</span>}
                    </>
                  ) : (
                    <>
                      <Mic className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
                      {!compact && <span className="ml-2">Parler</span>}
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isListening ? 'Arrêter l\'écoute' : 'Parler à l\'assistant'}
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Partial transcript indicator */}
        {isListening && partialTranscript && (
          <div className="text-sm text-muted-foreground italic max-w-[200px] truncate">
            "{partialTranscript}"
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
