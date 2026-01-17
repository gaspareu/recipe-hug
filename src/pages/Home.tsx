import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, RotateCcw, Loader2, BookOpen, User, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useHomeChat } from '@/hooks/useHomeChat';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const navigate = useNavigate();
  const {
    messages,
    isStreaming,
    sendMessage,
    resetChat
  } = useHomeChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const quickSuggestions = [
    { text: 'Chercher une recette de poulet' },
    { text: 'Crée-moi une recette de tarte' },
    { text: 'Voir toutes mes recettes' },
    { text: 'Qu\'est-ce que je peux faire avec des œufs ?' }
  ];

  const hasConversation = messages.length > 1;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Minimal header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-4">
        <div className="container max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={resetChat} 
              disabled={isStreaming || !hasConversation} 
              title="Nouvelle conversation"
              className="h-9 w-9"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/dashboard')} 
              title="Livre de recettes"
              className="h-9 w-9"
            >
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/profile')} 
              title="Profil"
              className="h-9 w-9"
            >
              <User className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col">
        {!hasConversation ? (
          /* Welcome screen - centered title */
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-32">
            <h1 className="text-3xl md:text-4xl font-display text-foreground text-center mb-2">
              Toujours prêt à cuisiner.
            </h1>
            <p className="text-muted-foreground text-center text-sm md:text-base">
              Chef Michel, votre assistant culinaire personnel
            </p>
          </div>
        ) : (
          /* Chat messages */
          <div className="flex-1 flex flex-col container max-w-3xl mx-auto w-full pt-16">
            <ScrollArea className="flex-1 px-4" ref={scrollRef}>
              <div className="py-6 space-y-6">
                {messages.slice(1).map(message => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${message.role === 'user' 
                      ? 'bg-muted rounded-3xl px-4 py-3' 
                      : ''}`}
                    >
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {isStreaming && messages[messages.length - 1]?.content === '' && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}

                {/* Partial transcript while listening */}
                {isListening && partialTranscript && (
                  <div className="flex justify-end">
                    <div className="bg-muted/50 rounded-3xl px-4 py-3 max-w-[85%]">
                      <p className="text-sm italic text-muted-foreground">{partialTranscript}...</p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Bottom input area */}
        <div className="p-4 pb-6">
          <div className="container max-w-3xl mx-auto space-y-4">
            {/* Quick suggestions - only on welcome screen */}
            {!hasConversation && (
              <div className="flex flex-wrap gap-2 justify-center mb-4">
                {quickSuggestions.map((suggestion, i) => (
                  <Button 
                    key={i} 
                    variant="outline" 
                    size="sm" 
                    onClick={() => sendMessage(suggestion.text)} 
                    disabled={isStreaming}
                    className="text-xs rounded-full px-4 border-border/50 hover:bg-muted"
                  >
                    {suggestion.text}
                  </Button>
                ))}
              </div>
            )}

            {/* Input container */}
            <div className="relative bg-muted rounded-3xl border border-border/50 overflow-hidden">
              <Textarea 
                ref={inputRef} 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                onKeyDown={handleKeyDown} 
                placeholder="Poser une question..." 
                className="min-h-[56px] max-h-40 resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 pr-24 py-4 px-4 text-base" 
                rows={1} 
                disabled={isStreaming || isListening} 
              />
              
              {/* Action buttons inside input */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                {/* Voice button */}
                <Button
                  variant={isListening ? "default" : "ghost"}
                  size="icon"
                  onClick={() => {
                    if (!voiceEnabled) {
                      toggleVoice();
                      setTimeout(() => startListening(), 100);
                    } else if (isListening) {
                      stopListening();
                    } else {
                      startListening();
                    }
                  }}
                  disabled={isStreaming}
                  className={`h-10 w-10 rounded-full ${isListening ? 'bg-primary text-primary-foreground' : ''}`}
                  title={isListening ? "Arrêter l'écoute" : "Mode vocal"}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                
                {/* Send button */}
                <Button 
                  onClick={handleSubmit} 
                  disabled={!input.trim() || isStreaming || isListening} 
                  size="icon" 
                  className="h-10 w-10 rounded-full"
                >
                  {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Speaking indicator */}
            {isSpeaking && (
              <div className="flex items-center justify-center gap-2">
                <button 
                  onClick={stopSpeaking}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  Chef Michel parle... (cliquez pour arrêter)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
