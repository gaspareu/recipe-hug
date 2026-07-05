import { useState, useCallback, useRef } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';

import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const SCRIBE_TOKEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`;

const SCRIBE_TIMEOUT_MS = 10_000;

export function useVoiceMode(onTranscript?: (text: string) => void) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  // Speech-to-text with ElevenLabs Scribe
  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: () => {},
    onCommittedTranscript: (data) => {
      if (data.text && onTranscript) {
        onTranscript(data.text);
        stopListening();
      }
    },
  });

  // Play next audio in queue
  const playNextInQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const text = audioQueueRef.current.shift()!;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        console.warn('TTS error:', response.status);
        throw new Error(`TTS failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setTimeout(() => {
          if (audioQueueRef.current.length > 0) {
            playNextInQueueRef.current?.();
          } else {
            isPlayingRef.current = false;
            setIsSpeaking(false);
          }
        }, 0);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setTimeout(() => {
          if (audioQueueRef.current.length > 0) {
            playNextInQueueRef.current?.();
          } else {
            isPlayingRef.current = false;
            setIsSpeaking(false);
          }
        }, 0);
      };

      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setTimeout(() => {
        if (audioQueueRef.current.length > 0) {
          playNextInQueueRef.current?.();
        } else {
          isPlayingRef.current = false;
          setIsSpeaking(false);
        }
      }, 0);
    }
  }, []);

  const playNextInQueueRef = useRef(playNextInQueue);
  playNextInQueueRef.current = playNextInQueue;

  // Text-to-speech
  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled || !text.trim()) return;

    const cleanText = text
      .replace(/[#*_`~]/g, '')
      .replace(/\n+/g, '. ')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE0F}\u{200D}]/gu, '')
      .trim();

    if (!cleanText) return;

    audioQueueRef.current.push(cleanText);
    
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  }, [voiceEnabled, playNextInQueue]);

  const stopSpeaking = useCallback(() => {
    audioQueueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Core listening logic — getUserMedia MUST be the first async call
  const doStartListening = useCallback(async () => {
    setIsConnecting(true);
    try {
      // 1. getUserMedia FIRST — must be in direct user gesture chain.
      // On libère aussitôt les pistes : ce flux ne sert qu'à obtenir la
      // permission micro ; Scribe ouvre ensuite le sien. Sans ce stop(), le
      // micro resterait actif (captation orpheline).
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());

      // 2. Get session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Authentication required');
      }
      
      // 3. Get scribe token with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SCRIBE_TIMEOUT_MS);

      const response = await fetch(SCRIBE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Failed to get scribe token');
      }

      const data = await response.json();
      
      if (!data.token) {
        throw new Error('No token received');
      }

      // 4. Connect scribe
      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      setIsListening(true);
    } catch (error) {
      console.error('Failed to start listening:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        toast("Accès au micro refusé. Autorise le micro dans les réglages de ton navigateur pour utiliser le mode vocal.");
      } else {
        toast("Impossible de démarrer le mode vocal. Vérifie ta connexion et réessaie.");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [scribe]);

  const stopListening = useCallback(() => {
    scribe.disconnect();
    setIsListening(false);
  }, [scribe]);

  const toggleVoice = useCallback(() => {
    const newState = !voiceEnabled;
    setVoiceEnabled(newState);
    
    if (!newState) {
      stopSpeaking();
      stopListening();
    }

    
  }, [voiceEnabled, stopSpeaking, stopListening]);

  // Enable voice AND start listening in one synchronous user gesture
  const enableAndListen = useCallback(() => {
    setVoiceEnabled(true);
    
    // Call doStartListening directly — no setTimeout, preserves user gesture
    doStartListening();
  }, [doStartListening]);

  return {
    voiceEnabled,
    isSpeaking,
    isListening,
    isConnecting,
    toggleVoice,
    speak,
    stopSpeaking,
    startListening: doStartListening,
    stopListening,
    enableAndListen,
    partialTranscript: scribe.partialTranscript,
  };
}
