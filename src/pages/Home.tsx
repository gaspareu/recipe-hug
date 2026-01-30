import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Plus, Loader2, BookOpen, User, Mic, MicOff, Check, X, ImagePlus, Camera, FileText, Image, AudioWaveform, ArrowUp, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useHomeChat } from '@/hooks/useHomeChat';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
export default function Home() {
  const navigate = useNavigate();
  const {
    messages,
    isStreaming,
    mode,
    activeRecipe,
    pendingRecipe,
    sendMessage,
    resetChat,
    savePendingRecipe,
    cancelPendingRecipe,
    getModeInfo
  } = useHomeChat();
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageRef = useRef<string>('');

  // Voice mode
  const handleVoiceTranscript = useCallback((text: string) => {
    if (text.trim()) {
      sendMessage(text);
    }
  }, [sendMessage]);
  const {
    voiceEnabled,
    isSpeaking,
    isListening,
    toggleVoice,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    partialTranscript
  } = useVoiceMode(handleVoiceTranscript);

  // Swipe left to navigate to recipes
  const {
    handlers: swipeHandlers,
    style: swipeStyle
  } = useSwipeNavigation({
    targetRoute: '/dashboard',
    direction: 'left',
    threshold: 80
  });
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && inputRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Speak new assistant messages
  useEffect(() => {
    if (!voiceEnabled) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content && !isStreaming && lastMessage.content !== lastMessageRef.current) {
      lastMessageRef.current = lastMessage.content;
      speak(lastMessage.content);
    }
  }, [messages, isStreaming, voiceEnabled, speak]);
  const handleSubmit = () => {
    if (!input.trim() && !selectedImage || isStreaming) return;
    sendMessage(input, selectedImage || undefined);
    setInput('');
    setSelectedImage(null);
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Seules les images sont acceptées');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image trop volumineuse (max 5 Mo)');
      return;
    }
    const reader = new FileReader();
    reader.onload = event => {
      const dataUrl = event.target?.result as string;
      setSelectedImage(dataUrl);
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  };
  const removeSelectedImage = () => {
    setSelectedImage(null);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Dynamic suggestions based on mode
  const getQuickSuggestions = () => {
    switch (mode) {
      case 'creating':
        return [{
          text: 'Plutôt simple et rapide'
        }, {
          text: 'Une version végétarienne'
        }, {
          text: "C'est parfait, enregistre !"
        }];
      case 'cooking':
        return [{
          text: 'Étape suivante'
        }, {
          text: 'Je peux substituer un ingrédient ?'
        }, {
          text: "C'est quoi la bonne texture ?"
        }];
      case 'editing':
        return [{
          text: 'Version végétarienne'
        }, {
          text: 'Moins calorique'
        }, {
          text: 'Enregistre les modifications'
        }];
      default:
        return [{
          text: 'Chercher une recette de poulet'
        }, {
          text: 'Crée-moi une recette de tarte'
        }, {
          text: 'Voir toutes mes recettes'
        }, {
          text: "Qu'est-ce que je peux faire avec des œufs ?"
        }];
    }
  };
  const quickSuggestions = getQuickSuggestions();
  const hasConversation = messages.length > 1;
  const modeInfo = getModeInfo();
  return <div className="h-[100dvh] flex flex-col bg-background pt-[env(safe-area-inset-top)]" {...swipeHandlers} style={swipeStyle}>
      {/* Minimal header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-4">
        <div className="container max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={resetChat} disabled={isStreaming || !hasConversation} title="Nouvelle conversation" className="h-9 w-9">
              <Plus className="h-4 w-4" />
            </Button>
            
            {/* Mode indicator */}
            {modeInfo && <Badge variant="outline" className={`${modeInfo.color} text-xs font-normal`}>
                <span className="mr-1">{modeInfo.icon}</span>
                {modeInfo.label}
                {activeRecipe && <span className="ml-1 opacity-70">• {activeRecipe.title}</span>}
              </Badge>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Livre de recettes" className="h-9 w-9">
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} title="Profil" className="h-9 w-9">
              <User className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {!hasConversation ? (/* Welcome screen - positioned higher to keep input visible */
      <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-24">
            <h1 className="text-3xl md:text-4xl font-display text-foreground text-center mb-2">
              Toujours prêt à cuisiner.
            </h1>
            <p className="text-muted-foreground text-center text-sm md:text-base">
              Chef, votre assistant culinaire personnel
            </p>
          </div>) : (/* Chat messages */
      <div className="flex-1 flex flex-col container max-w-3xl mx-auto w-full pt-16">
            <ScrollArea className="flex-1 px-4" ref={scrollRef}>
              <div className="py-6 space-y-6">
                {messages.slice(1).map(message => {
                  // Filter out action JSON from display
                  let displayContent = message.content;
                  if (message.role === 'assistant' && displayContent) {
                    // Remove JSON action blocks that might be accidentally displayed
                    displayContent = displayContent.replace(/\{\s*"action"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:\s*\{[^}]*\}\s*\}/g, '').trim();
                  }
                  
                  return (
                    <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] ${message.role === 'user' ? 'bg-muted rounded-3xl px-4 py-3' : ''}`}>
                        {/* Display image if present */}
                        {message.imageUrl && <img src={message.imageUrl} alt="Image envoyée" className="max-w-full max-h-64 rounded-2xl mb-2 object-cover" />}
                        {message.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground prose-li:text-foreground">
                            <ReactMarkdown>{displayContent}</ReactMarkdown>
                          </div>
                        ) : message.content && message.content !== "📷 Image envoyée" && (
                          <p className="text-sm whitespace-pre-wrap text-foreground">{message.content}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isStreaming && messages[messages.length - 1]?.content === '' && <div className="flex justify-start">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{
                  animationDelay: '0ms'
                }} />
                      <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{
                  animationDelay: '150ms'
                }} />
                      <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{
                  animationDelay: '300ms'
                }} />
                    </div>
                  </div>}

                {/* Partial transcript while listening */}
                {isListening && partialTranscript && <div className="flex justify-end">
                    <div className="bg-muted/50 rounded-3xl px-4 py-3 max-w-[85%]">
                      <p className="text-sm italic text-muted-foreground">{partialTranscript}...</p>
                    </div>
                  </div>}
              </div>
            </ScrollArea>
          </div>)}

        {/* Bottom area - with safe area padding for PWA */}
        <div className="shrink-0 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="container max-w-3xl mx-auto space-y-4">
            {/* Pending recipe action bar */}
            {pendingRecipe && <div className="flex flex-col gap-3 p-3 bg-primary/5 border border-primary/20 rounded-2xl">
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
              </div>}

            {/* Quick suggestions */}
            {!hasConversation && <div className="flex flex-wrap gap-2 justify-center mb-4">
                {quickSuggestions.map((suggestion, i) => <Button key={i} variant="outline" size="sm" onClick={() => sendMessage(suggestion.text)} disabled={isStreaming} className="text-sm rounded-2xl px-4 py-2 h-auto whitespace-normal text-center border-border/50 hover:bg-muted">
                    {suggestion.text}
                  </Button>)}
              </div>}

            {/* Contextual suggestions when in specialized modes */}
            {hasConversation && mode !== 'orchestration' && !pendingRecipe && <div className="flex flex-wrap gap-2 justify-center">
                {quickSuggestions.map((suggestion, i) => <Button key={i} variant="ghost" size="sm" onClick={() => sendMessage(suggestion.text)} disabled={isStreaming} className="text-sm rounded-2xl px-4 py-2 h-auto whitespace-normal text-center text-muted-foreground hover:text-foreground">
                    {suggestion.text}
                  </Button>)}
              </div>}

            {/* Input container - ChatGPT style */}
            <div className="relative bg-muted rounded-[24px] border border-border/50 mx-auto w-full max-w-[800px] px-3 py-3">
              {/* Image preview */}
              {selectedImage && <div className="pb-2">
                  <div className="relative inline-block">
                    <img src={selectedImage} alt="Aperçu" className="h-20 w-20 object-cover rounded-xl" />
                    <button onClick={removeSelectedImage} className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>}
              
              {/* Main input row with flex alignment */}
              <div className="flex items-end gap-2">
                {/* Add button with popover menu */}
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
                      <TooltipContent side="top">
                        <p>Ajouter des fichiers et plus encore <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-xs">/</kbd></p>
                      </TooltipContent>
                    </Tooltip>
                    <PopoverContent className="w-56 p-1" align="start" side="top">
                      <div className="flex flex-col">
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                          <FileText className="h-4 w-4" />
                          <span>Ajouter des fichiers</span>
                        </button>
                        <button onClick={() => {
                        // Trigger camera capture on mobile
                        if (fileInputRef.current) {
                          fileInputRef.current.setAttribute('capture', 'environment');
                          fileInputRef.current.click();
                          fileInputRef.current.removeAttribute('capture');
                        }
                      }} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                          <Camera className="h-4 w-4" />
                          <span>Prendre une photo</span>
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                          <Image className="h-4 w-4" />
                          <span>Ajouter une image</span>
                        </button>
                        <div className="h-px bg-border my-1" />
                        <button className="flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-foreground">
                          <span className="flex items-center gap-3">
                            <Plus className="h-4 w-4" />
                            <span>Plus</span>
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </TooltipProvider>
                
                {/* Textarea - expands vertically */}
                <div className="flex-1 flex items-center min-h-[36px]">
                  <Textarea ref={inputRef} value={input} onChange={e => {
                  setInput(e.target.value);
                  // Auto-resize textarea
                  const target = e.target;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                }} onKeyDown={handleKeyDown} placeholder="Poser une question" className="w-full min-h-[24px] max-h-[200px] resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 py-0 px-0 text-base leading-9 placeholder:text-muted-foreground self-center" rows={1} disabled={isStreaming || isListening} />
                </div>
                
                {/* Hidden file input */}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                
                {/* Right side buttons - stay at bottom */}
                <div className="flex items-center gap-1">
                  {/* Microphone button - visible when input is empty or short */}
                  {!input.trim() && !selectedImage && <button onClick={() => {
                  if (!voiceEnabled) {
                    toggleVoice();
                    setTimeout(() => startListening(), 100);
                  } else if (isListening) {
                    stopListening();
                  } else {
                    startListening();
                  }
                }} disabled={isStreaming} className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors ${isListening ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-foreground'}`} title={isListening ? "Arrêter l'écoute" : "Dicter"}>
                      {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </button>}
                  
                  {/* Voice mode / Send button */}
                  
                </div>
              </div>
            </div>

            {/* Speaking indicator */}
            {isSpeaking && <div className="flex items-center justify-center gap-2">
                <button onClick={stopSpeaking} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  Chef parle... (cliquez pour arrêter)
                </button>
              </div>}
          </div>
        </div>
      </div>
    </div>;
}