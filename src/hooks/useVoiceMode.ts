import { useState, useCallback, useRef } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { toast } from 'sonner';

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const SCRIBE_TOKEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`;

export function useVoiceMode(onTranscript?: (text: string) => void) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  // Speech-to-text with ElevenLabs Scribe
  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      // Optional: could show partial transcript
    },
    onCommittedTranscript: (data) => {
      if (data.text && onTranscript) {
        onTranscript(data.text);
        stopListening();
      }
    },
  });

  // Text-to-speech
  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled || !text.trim()) return;

    // Clean text for speech (remove markdown, emojis, etc.)
    const cleanText = text
      .replace(/[#*_`~]/g, '') // Remove markdown
      .replace(/\n+/g, '. ') // Convert newlines to pauses
      .replace(/[👨‍🍳✨🎉🍽️🥗🍝🥘]/g, '') // Remove emojis
      .trim();

    if (!cleanText) return;

    // Add to queue
    audioQueueRef.current.push(cleanText);
    
    // Start playing if not already
    if (!isPlayingRef.current) {
      playNextInQueue();
    }
  }, [voiceEnabled]);

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
      const response = await fetch(TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Stop any current audio
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        playNextInQueue();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        playNextInQueue();
      };

      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      playNextInQueue();
    }
  }, []);

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

  // Start listening (STT)
  const startListening = useCallback(async () => {
    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get scribe token
      const response = await fetch(SCRIBE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get scribe token');
      }

      const data = await response.json();
      
      if (!data.token) {
        throw new Error('No token received');
      }

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
      toast.error('Impossible d\'accéder au microphone');
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

    toast.success(newState ? 'Mode vocal activé' : 'Mode vocal désactivé');
  }, [voiceEnabled, stopSpeaking, stopListening]);

  return {
    voiceEnabled,
    isSpeaking,
    isListening,
    toggleVoice,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    partialTranscript: scribe.partialTranscript,
  };
}
