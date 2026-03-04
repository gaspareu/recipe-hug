import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Mic, MicOff, ArrowUp, X, Camera, FileText, Image, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { toast } from 'sonner';
import type { ChatMessage, ChatMode, PendingRecipe } from '@/hooks/useChatEngine';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  mode: ChatMode;
  pendingRecipe: PendingRecipe | null;
  sendMessage: (content: string, imageDataUrl?: string) => void;
  savePendingRecipe: () => void;
  cancelPendingRecipe: () => void;
  getModeInfo: () => { label: string; icon: string; color: string } | null;
  suggestions: string[];
  placeholder?: string;
  showWelcomeScreen?: boolean;
  welcomeContent?: React.ReactNode;
  headerContent?: React.ReactNode;
  className?: string;
  /** If true, skip the first (welcome) message in display */
  skipFirstMessage?: boolean;
}

export function ChatInterface({
  messages,
  isStreaming,
  mode,
  pendingRecipe,
  sendMessage,
  savePendingRecipe,
  cancelPendingRecipe,
  getModeInfo,
  suggestions,
  placeholder = 'Poser une question',
  showWelcomeScreen = false,
  welcomeContent,
  headerContent,
  className = '',
  skipFirstMessage = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageRef = useRef<string>('');

  // Voice mode
  const handleVoiceTranscript = useCallback((text: string) => {
    if (text.trim()) sendMessage(text);
  }, [sendMessage]);

  const {
    voiceEnabled, isSpeaking, isListening,
    toggleVoice, speak, stopSpeaking, startListening, stopListening,
    partialTranscript,
  } = useVoiceMode(handleVoiceTranscript);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Auto-speak new assistant messages
  useEffect(() => {
    if (!voiceEnabled) return;
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && last.content && !isStreaming && last.content !== lastMessageRef.current) {
      lastMessageRef.current = last.content;
      speak(last.content);
    }
  }, [messages, isStreaming, voiceEnabled, speak]);

  const handleSubmit = () => {
    if ((!input.trim() && !selectedImage) || isStreaming) return;
    sendMessage(input, selectedImage || undefined);
    setInput('');
    setSelectedImage(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Seules les images sont acceptées'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image trop volumineuse (max 5 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = event => setSelectedImage(event.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const hasConversation = messages.length > 1;
  const modeInfo = getModeInfo();

  // Extract dynamic suggestions from last assistant message
  const suggestionsRegex = /\[suggestions\]\s*(\[.*?\])\s*\[\/suggestions\]/s;
  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant' && m.content);
  let dynamicSuggestions: string[] = [];
  if (lastAssistantMessage?.content) {
    const match = lastAssistantMessage.content.match(suggestionsRegex);
    if (match) {
      try { dynamicSuggestions = JSON.parse(match[1]); } catch {}
    }
  }
  const activeSuggestions = dynamicSuggestions.length > 0 ? dynamicSuggestions : suggestions;

  const displayMessages = skipFirstMessage ? messages.slice(1) : messages;

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      {/* Header content (mode badge, nav buttons, etc.) injected by parent */}
      {headerContent}

      {/* Mode badge (if no custom header and mode is active) */}
      {!headerContent && modeInfo && (
        <div className="px-4 pt-2">
          <Badge variant="outline" className={`${modeInfo.color} text-xs font-normal`}>
            <span className="mr-1">{modeInfo.icon}</span>
            {modeInfo.label}
          </Badge>
        </div>
      )}

      {/* Main content */}
      {showWelcomeScreen && !hasConversation ? (
        welcomeContent
      ) : (
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-6">
            {displayMessages.map(message => {
              let displayContent = message.content;
              if (message.role === 'assistant' && displayContent) {
                displayContent = displayContent.replace(/\{\s*"action"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{[^}]*\}\s*\}/g, '').trim();
                displayContent = displayContent.replace(/\[suggestions\]\s*\[.*?\]\s*\[\/suggestions\]/s, '').trim();
              return (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${message.role === 'user' ? 'bg-muted rounded-3xl px-4 py-3' : ''}`}>
                    {message.imageUrl && <img src={message.imageUrl} alt="Image envoyée" className="max-w-full max-h-64 rounded-2xl mb-2 object-cover" />}
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground prose-li:text-foreground">
                        <ReactMarkdown>{displayContent}</ReactMarkdown>
                      </div>
                    ) : message.content && message.content !== '📷 Image envoyée' && (
                      <p className="text-sm whitespace-pre-wrap text-foreground">{message.content}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {isStreaming && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <TextShimmer className="font-mono text-sm" duration={1}>
                  Réflexion en cours...
                </TextShimmer>
              </div>
            )}

            {isListening && partialTranscript && (
              <div className="flex justify-end">
                <div className="bg-muted/50 rounded-3xl px-4 py-3 max-w-[85%]">
                  <p className="text-sm italic text-muted-foreground">{partialTranscript}...</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Pending recipe bar */}
      {pendingRecipe && (
        <div className="flex flex-col gap-3 p-3 mx-4 bg-primary/5 border border-primary/20 rounded-2xl">
          <p className="text-sm text-foreground text-center break-words">
            {pendingRecipe.isUpdate ? `Mettre à jour "${pendingRecipe.title}" ?` : `Enregistrer "${pendingRecipe.title}" ?`}
          </p>
          <div className="flex justify-end items-center gap-2">
            <Button size="sm" onClick={savePendingRecipe} className="gap-1">
              <Check className="h-4 w-4" />
              {pendingRecipe.isUpdate ? 'Mettre à jour' : 'Créer'}
            </Button>
            <Button size="icon" variant="ghost" onClick={cancelPendingRecipe} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bottom area */}
      <div className="shrink-0 p-4 space-y-4">
        {/* Quick suggestions */}
        {!pendingRecipe && suggestions.length > 0 && (
          <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
            <div className="flex gap-2 w-max">
              {suggestions.map((suggestion, i) => (
                <Button
                  key={i}
                  variant={hasConversation && mode !== 'orchestration' ? 'ghost' : 'outline'}
                  size="sm"
                  onClick={() => sendMessage(suggestion)}
                  disabled={isStreaming}
                  className="text-sm rounded-2xl px-4 py-2 h-auto whitespace-nowrap border-border/50 hover:bg-muted shrink-0"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input container */}
        <div className="relative bg-muted rounded-[24px] border border-border/50 px-3 py-3 max-w-[800px] mx-auto w-full">
          {selectedImage && (
            <div className="pb-2">
              <div className="relative inline-block">
                <img src={selectedImage} alt="Aperçu" className="h-20 w-20 object-cover rounded-xl" />
                <button onClick={() => setSelectedImage(null)} className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90">
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Add button with popover */}
            <TooltipProvider>
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button className="flex-shrink-0 h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors" disabled={isStreaming || isListening}>
                        <Plus className="h-5 w-5 text-foreground" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Ajouter</p></TooltipContent>
                </Tooltip>
                <PopoverContent className="w-56 p-1" align="start" side="top">
                  <div className="flex flex-col">
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                      <FileText className="h-4 w-4" /><span>Ajouter des fichiers</span>
                    </button>
                    <button onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute('capture', 'environment');
                        fileInputRef.current.click();
                        fileInputRef.current.removeAttribute('capture');
                      }
                    }} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                      <Camera className="h-4 w-4" /><span>Prendre une photo</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                      <Image className="h-4 w-4" /><span>Ajouter une image</span>
                    </button>
                    <div className="h-px bg-border my-1" />
                    <button className="flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                      <span className="flex items-center gap-3"><Plus className="h-4 w-4" /><span>Plus</span></span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </TooltipProvider>

            {/* Textarea */}
            <div className="flex-1 flex items-center min-h-[36px]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  const target = e.target;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? 'Parlez...' : placeholder}
                className="w-full min-h-[24px] max-h-[200px] resize-none bg-transparent border-0 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 py-0 px-0 text-base leading-9 placeholder:text-muted-foreground self-center text-foreground"
                rows={1}
                disabled={isStreaming || isListening}
              />
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />

            {/* Mic / Send button */}
            <div className="flex items-center gap-1">
              {!input.trim() && !selectedImage ? (
                <button
                  onClick={() => {
                    if (!voiceEnabled) { toggleVoice(); setTimeout(() => startListening(), 100); }
                    else if (isListening) stopListening();
                    else startListening();
                  }}
                  disabled={isStreaming}
                  className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors ${isListening ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'}`}
                  title={isListening ? "Arrêter l'écoute" : 'Dicter'}
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={isStreaming}
                  className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors bg-foreground text-background hover:bg-foreground/90"
                  title="Envoyer"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="flex items-center justify-center gap-2">
            <button onClick={stopSpeaking} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              Chef parle... (cliquez pour arrêter)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
