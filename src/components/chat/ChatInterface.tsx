import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Plus, Mic, MicOff, ArrowUp, X, Camera, FileText, Image, ChevronRight, Check, Copy, RotateCw, Loader2, ChefHat, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TextShimmer } from '@/components/ui/text-shimmer';
import { toast } from '@/components/ui/sonner';
import { SoundWaveIndicator } from '@/components/voice/SoundWaveIndicator';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { messageVariants, messageTransition } from '@/lib/motion';
import { useNavigate } from 'react-router-dom';

import type { ChatMessage, PendingRecipe } from '@/hooks/useChatEngine';

/** RegExp extraite au niveau module pour éviter une recréation à chaque rendu */
const SUGGESTIONS_REGEX = /\[suggestions\]\s*(\[.*?\])\s*\[\/suggestions\]/s;

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingRecipe: PendingRecipe | null;
  isSavingRecipe?: boolean;
  sendMessage: (content: string, imageDataUrl?: string) => void;
  savePendingRecipe: () => void;
  cancelPendingRecipe: () => void;
  regenerateResponse?: () => void;
  stopGeneration?: () => void;
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
  pendingRecipe,
  isSavingRecipe = false,
  sendMessage,
  savePendingRecipe,
  cancelPendingRecipe,
  regenerateResponse,
  stopGeneration,
  suggestions,
  placeholder = 'Poser une question',
  showWelcomeScreen = false,
  welcomeContent,
  headerContent,
  className = '',
  skipFirstMessage = false,
}: ChatInterfaceProps) {
  const navigate = useNavigate();
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
    voiceEnabled, isSpeaking, isListening, isConnecting,
    toggleVoice, speak, stopSpeaking, startListening, stopListening,
    enableAndListen, partialTranscript,
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
    if (!file.type.startsWith('image/')) { return; }
    if (file.size > 5 * 1024 * 1024) { return; }
    const reader = new FileReader();
    reader.onload = event => setSelectedImage(event.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast('Message copié');
    } catch {
      toast('Impossible de copier le message');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const hasConversation = messages.length > 1;

  // Suggestions dynamiques extraites du dernier message assistant (SUGGESTIONS_REGEX = constante module-level)
  const activeSuggestions = useMemo(() => {
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant' && m.content);
    if (lastAssistantMessage?.content) {
      const match = lastAssistantMessage.content.match(SUGGESTIONS_REGEX);
      if (match) {
        try { return JSON.parse(match[1]) as string[]; } catch { /* JSON invalide : on garde les suggestions par défaut */ }
      }
    }
    return suggestions;
  }, [messages, suggestions]);

  const displayMessages = useMemo(
    () => skipFirstMessage ? messages.slice(1) : messages,
    [messages, skipFirstMessage]
  );

  const getDisplayContent = useCallback((message: ChatMessage): string => {
    let content = message.content;
    if (message.role === 'assistant' && content) {
      content = content.replace(/\{\s*"action"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{[^}]*\}\s*\}/g, '').trim();
      content = content.replace(SUGGESTIONS_REGEX, '').trim();
    }
    return content;
  }, []);

  // Le contenu brut du dernier message peut contenir uniquement un appel d'outil
  // (ex: enregistrement de recette) qui disparaît une fois nettoyé : tant que rien
  // n'est encore affichable, on garde le feedback "Réflexion en cours..." visible.
  const showThinkingIndicator = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    return isStreaming && lastMessage?.role === 'assistant' && getDisplayContent(lastMessage) === '';
  }, [messages, isStreaming, getDisplayContent]);

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      {headerContent}

      {/* Main content */}
      {showWelcomeScreen && !hasConversation ? (
        welcomeContent
      ) : (
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div role="log" aria-label="Conversation" aria-live="polite" className="flex flex-col justify-end min-h-full py-4 space-y-6">
            {displayMessages.map(message => {
              const displayContent = getDisplayContent(message);
              const isLast = message.id === messages[messages.length - 1]?.id;
              const showCaret = isStreaming && isLast && message.role === 'assistant' && displayContent !== '';
              const showActions = message.role === 'assistant' && displayContent !== '' && !(isStreaming && isLast);
              return (
                <motion.div
                  key={message.id}
                  variants={messageVariants}
                  initial="initial"
                  animate="animate"
                  transition={messageTransition}
                  className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[80%] ${message.role === 'user' ? 'bg-muted rounded-3xl px-4 py-3' : ''}`}>
                    {message.imageUrl && <img src={message.imageUrl} alt="Image envoyée" className="max-w-full max-h-64 rounded-2xl mb-2 object-cover" />}
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground prose-p:leading-relaxed prose-li:text-foreground">
                        <ReactMarkdown>{displayContent}</ReactMarkdown>
                        {showCaret && (
                          <motion.span
                            className="ml-0.5 inline-block h-[1.05em] w-[2px] -mb-[0.15em] rounded-full bg-foreground/70 align-middle"
                            animate={{ opacity: [1, 0, 1] }}
                            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        )}
                      </div>
                    ) : message.content && message.content !== '📷 Image envoyée' && (
                      <p className="text-sm whitespace-pre-wrap text-foreground">{message.content}</p>
                    )}
                    {showActions && (
                      <div className="flex items-center gap-1 mt-1 -ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopy(displayContent)}
                          title="Copier le message"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {isLast && regenerateResponse && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={regenerateResponse}
                            disabled={isStreaming}
                            title="Relancer la réponse"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                    {message.recipeCard && (
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <ChefHat className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{message.recipeCard.title}</p>
                            <p className="text-xs text-muted-foreground">{message.recipeCard.servings} portions</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="shrink-0"
                          onClick={() => navigate(`/recipes/${message.recipeCard?.id}`)}
                        >
                          Voir
                        </Button>
                      </div>
                    )}
                  </div>
                  {message.role === 'user' && message.content && message.content !== '📷 Image envoyée' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(message.content)}
                      title="Copier le message"
                      className="h-7 w-7 mt-1 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </motion.div>
              );
            })}

            {showThinkingIndicator && (
              <div className="flex justify-start" role="status" aria-live="polite" aria-label="Réflexion en cours">
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
      <AnimatePresence>
      {pendingRecipe && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
        <div className="flex flex-col gap-3 p-3 mx-4 bg-primary/5 border border-primary/20 rounded-2xl">
          <p className="text-sm text-foreground text-center break-words">
            {pendingRecipe.isUpdate ? `Mettre à jour "${pendingRecipe.title}" ?` : `Enregistrer "${pendingRecipe.title}" ?`}
          </p>
          <div className="flex justify-end items-center gap-2">
            <Button size="sm" onClick={savePendingRecipe} disabled={isSavingRecipe} className="gap-1">
              {isSavingRecipe ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {pendingRecipe.isUpdate ? 'Mettre à jour' : 'Créer'}
            </Button>
            <Button size="icon" variant="ghost" onClick={cancelPendingRecipe} disabled={isSavingRecipe} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Bottom area */}
      <div className="shrink-0 p-4 space-y-4">
        {/* Quick suggestions */}
        {!pendingRecipe && activeSuggestions.length > 0 && (
          <div className="overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] -mx-4 px-4" data-no-swipe-nav data-testid="suggestions-scroll">
            <div className="flex gap-2 w-max">
              {activeSuggestions.map((suggestion, i) => (
                <Button
                  key={i}
                  variant={hasConversation ? 'ghost' : 'outline'}
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
        <div className="relative bg-muted rounded-[24px] border border-border/50 px-3 py-3 max-w-[800px] mx-auto w-full transition-shadow focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary/30">
          {selectedImage && (
            <div className="pb-2">
              <div className="relative inline-block">
                <img src={selectedImage} alt="Aperçu" className="h-20 w-20 object-cover rounded-xl" />
                <button onClick={() => setSelectedImage(null)} aria-label="Supprimer l'image" className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90 touch-manipulation">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end gap-2">
            <TooltipProvider>
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button aria-label="Ajouter une pièce jointe" aria-haspopup="true" className="flex-shrink-0 h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-accent transition-colors touch-manipulation" disabled={isStreaming || isListening}>
                        <Plus className="h-5 w-5 text-foreground" aria-hidden="true" />
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
                aria-label={isListening ? 'Parlez...' : placeholder}
                className={`w-full min-h-[24px] max-h-[200px] resize-none bg-transparent border-0 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 py-0 px-0 text-base placeholder:text-muted-foreground self-center text-foreground ${input ? 'leading-6' : 'leading-9'}`}
                rows={1}
                disabled={isStreaming || isListening}
              />
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" aria-hidden="true" tabIndex={-1} />

            {/* Mic / Send button */}
            <div className="flex items-center gap-1">
              <AnimatePresence mode="popLayout" initial={false}>
                {isStreaming && stopGeneration ? (
                  <motion.button
                    key="stop"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={stopGeneration}
                    className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors bg-foreground text-background hover:bg-foreground/90 touch-manipulation"
                    title="Arrêter la génération"
                    aria-label="Arrêter la génération"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  </motion.button>
                ) : !input.trim() && !selectedImage ? (
                  <motion.button
                    key="mic"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => {
                      if (!voiceEnabled) { enableAndListen(); }
                      else if (isListening) stopListening();
                      else startListening();
                    }}
                    disabled={isStreaming || isConnecting}
                    className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors touch-manipulation ${isListening ? 'bg-primary text-primary-foreground' : isConnecting ? 'bg-muted animate-pulse' : 'hover:bg-accent text-foreground'}`}
                    title={isConnecting ? 'Connexion...' : isListening ? "Arrêter l'écoute" : 'Dicter'}
                    aria-label={isConnecting ? 'Connexion en cours...' : isListening ? "Arrêter l'écoute" : 'Dicter un message'}
                    aria-pressed={isListening}
                  >
                    {isConnecting ? (
                      <Mic className="h-5 w-5 text-muted-foreground" />
                    ) : isListening ? (
                      <SoundWaveIndicator />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={handleSubmit}
                    disabled={isStreaming}
                    className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors bg-foreground text-background hover:bg-foreground/90 touch-manipulation"
                    title="Envoyer"
                    aria-label="Envoyer le message"
                  >
                    <ArrowUp className="h-5 w-5" aria-hidden="true" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Speaking indicator */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex items-center justify-center gap-2"
            >
              <button onClick={stopSpeaking} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10">
                <SoundWaveIndicator className="h-4" barCount={5} />
                <span>Chef parle... (cliquez pour arrêter)</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Indicateur de mode vocal activé (hors écoute/lecture) */}
        <AnimatePresence>
          {voiceEnabled && !isSpeaking && !isListening && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex items-center justify-center"
            >
              <button onClick={toggleVoice} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted" title="Désactiver le mode vocal" aria-label="Désactiver le mode vocal" aria-pressed={true}>
                <Mic className="h-3.5 w-3.5" />
                <span>Mode vocal activé</span>
                <MicOff className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
