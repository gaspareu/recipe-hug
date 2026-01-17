import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, RotateCcw, Loader2, BookOpen, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useHomeChat } from '@/hooks/useHomeChat';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { VoiceControls } from '@/components/voice/VoiceControls';
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
  const quickSuggestions = [{
    icon: '🔍',
    text: 'Chercher une recette de poulet'
  }, {
    icon: '✨',
    text: 'Crée-moi une recette de tarte'
  }, {
    icon: '📖',
    text: 'Voir toutes mes recettes'
  }];
  const showSuggestions = messages.length <= 1;
  return <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-primary">Mes recettes</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={resetChat} disabled={isStreaming || messages.length <= 1} title="Nouvelle conversation">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Livre de recettes">
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} title="Profil">
              <User className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 flex flex-col container max-w-4xl mx-auto w-full">
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-6 space-y-4">
            {messages.map(message => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {message.role === 'assistant' ? <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div> : <p className="text-sm whitespace-pre-wrap">{message.content}</p>}
                </div>
              </div>)}

            {isStreaming && messages[messages.length - 1]?.content === '' && <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>}

            {/* Partial transcript while listening */}
            {isListening && partialTranscript && <div className="flex justify-end">
                <div className="bg-primary/50 text-primary-foreground rounded-2xl px-4 py-3 max-w-[85%]">
                  <p className="text-sm italic">{partialTranscript}...</p>
                </div>
              </div>}
          </div>
        </ScrollArea>

        {/* Quick suggestions */}
        {showSuggestions && <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2 justify-center">
              {quickSuggestions.map((suggestion, i) => <Button key={i} variant="outline" size="sm" onClick={() => sendMessage(suggestion.text)} disabled={isStreaming} className="text-xs">
                  <span className="mr-1">{suggestion.icon}</span>
                  {suggestion.text}
                </Button>)}
            </div>
          </div>}

        {/* Input area */}
        <div className="border-t bg-card/50 backdrop-blur-sm p-4">
          <div className="max-w-4xl mx-auto">
            {/* Voice controls */}
            <div className="mb-3">
              <VoiceControls voiceEnabled={voiceEnabled} isSpeaking={isSpeaking} isListening={isListening} onToggleVoice={toggleVoice} onStopSpeaking={stopSpeaking} onStartListening={startListening} onStopListening={stopListening} />
            </div>

            <div className="flex gap-2">
              <Textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Demande-moi ce que tu veux..." className="min-h-[44px] max-h-32 resize-none bg-background" rows={1} disabled={isStreaming || isListening} />
              <Button onClick={handleSubmit} disabled={!input.trim() || isStreaming || isListening} size="icon" className="h-11 w-11 shrink-0">
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>;
}