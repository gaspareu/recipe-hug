import { useState, useCallback, useRef, useEffect } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';

import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { splitTextForSpeech } from '@/lib/assistant-content';

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const SCRIBE_TOKEN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`;

const SCRIBE_TOKEN_TIMEOUT_MS = 10_000;
const SCRIBE_CONNECTION_TIMEOUT_MS = 12_000;
const SCRIBE_INACTIVITY_TIMEOUT_MS = 30_000;
const TTS_TIMEOUT_MS = 20_000;
const SCRIBE_KEYTERMS = ['Thermomix', 'Cookidoo', 'TM7', 'Varoma', 'mijotage', 'sens inverse'];

export function useVoiceMode(onTranscript?: (text: string) => void) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const mountedRef = useRef(true);
  const onTranscriptRef = useRef(onTranscript);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const playbackGenerationRef = useRef(0);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const scribeRef = useRef<ReturnType<typeof useScribe> | null>(null);
  const scribeTokenAbortRef = useRef<AbortController | null>(null);
  const scribeConnectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scribeInactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningAttemptRef = useRef(false);
  const acceptScribeEventsRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const clearScribeConnectionTimeout = useCallback(() => {
    if (scribeConnectionTimeoutRef.current) {
      clearTimeout(scribeConnectionTimeoutRef.current);
      scribeConnectionTimeoutRef.current = null;
    }
  }, []);

  const clearScribeInactivityTimeout = useCallback(() => {
    if (scribeInactivityTimeoutRef.current) {
      clearTimeout(scribeInactivityTimeoutRef.current);
      scribeInactivityTimeoutRef.current = null;
    }
  }, []);

  const resetListeningState = useCallback(() => {
    clearScribeConnectionTimeout();
    clearScribeInactivityTimeout();
    listeningAttemptRef.current = false;
    if (mountedRef.current) {
      setIsListening(false);
      setIsConnecting(false);
    }
  }, [clearScribeConnectionTimeout, clearScribeInactivityTimeout]);

  const stopListening = useCallback(() => {
    acceptScribeEventsRef.current = false;
    scribeTokenAbortRef.current?.abort();
    scribeTokenAbortRef.current = null;
    scribeRef.current?.disconnect();
    scribeRef.current?.clearTranscripts();
    resetListeningState();
  }, [resetListeningState]);

  const handleScribeError = useCallback((error: Error | Event) => {
    if (!acceptScribeEventsRef.current) return;
    console.error('Scribe error:', error);
    acceptScribeEventsRef.current = false;
    scribeRef.current?.disconnect();
    resetListeningState();
    toast("La transcription vocale s'est interrompue. Réessaie dans un instant.");
  }, [resetListeningState]);

  const handleScribeServiceError = useCallback((data: { error: string }) => {
    handleScribeError(new Error(data.error));
  }, [handleScribeError]);

  const armScribeInactivityTimeout = useCallback(() => {
    clearScribeInactivityTimeout();
    scribeInactivityTimeoutRef.current = setTimeout(() => {
      if (!acceptScribeEventsRef.current) return;
      acceptScribeEventsRef.current = false;
      scribeRef.current?.disconnect();
      resetListeningState();
      toast("Aucun son détecté. Vérifie le micro puis réessaie.");
    }, SCRIBE_INACTIVITY_TIMEOUT_MS);
  }, [clearScribeInactivityTimeout, resetListeningState]);

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    languageCode: 'fr',
    keyterms: SCRIBE_KEYTERMS,
    noVerbatim: true,
    commitStrategy: CommitStrategy.VAD,
    onSessionStarted: () => {
      if (!acceptScribeEventsRef.current) return;
      clearScribeConnectionTimeout();
      listeningAttemptRef.current = false;
      setIsConnecting(false);
      setIsListening(true);
      armScribeInactivityTimeout();
    },
    onPartialTranscript: armScribeInactivityTimeout,
    onCommittedTranscript: (data) => {
      if (!acceptScribeEventsRef.current) return;
      if (data.text) onTranscriptRef.current?.(data.text);
      stopListening();
    },
    onError: handleScribeError,
    onAuthError: handleScribeServiceError,
    onQuotaExceededError: handleScribeServiceError,
    onCommitThrottledError: handleScribeServiceError,
    onTranscriberError: handleScribeServiceError,
    onUnacceptedTermsError: handleScribeServiceError,
    onRateLimitedError: handleScribeServiceError,
    onInputError: handleScribeServiceError,
    onQueueOverflowError: handleScribeServiceError,
    onResourceExhaustedError: handleScribeServiceError,
    onSessionTimeLimitExceededError: handleScribeServiceError,
    onChunkSizeExceededError: handleScribeServiceError,
    onInsufficientAudioActivityError: handleScribeServiceError,
    onDisconnect: () => {
      acceptScribeEventsRef.current = false;
      resetListeningState();
    },
  });

  useEffect(() => {
    scribeRef.current = scribe;
  });

  const finishPlayback = useCallback((generation: number) => {
    if (!mountedRef.current || generation !== playbackGenerationRef.current) return;
    if (audioQueueRef.current.length > 0) {
      queueMicrotask(() => playNextInQueueRef.current?.());
      return;
    }
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const playNextInQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      if (mountedRef.current) setIsSpeaking(false);
      return;
    }

    const generation = playbackGenerationRef.current;
    const text = audioQueueRef.current.shift()!;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
    ttsAbortRef.current = controller;
    isPlayingRef.current = true;
    setIsSpeaking(true);
    let audioUrl: string | null = null;
    let audio: HTMLAudioElement | null = null;
    let audioSettled = false;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Authentication required');
      if (generation !== playbackGenerationRef.current || !mountedRef.current) return;
      if (controller.signal.aborted) throw new DOMException('TTS request timed out', 'AbortError');

      const response = await fetch(TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      // Le serveur surveille ensuite l'inactivité du flux ; le navigateur ne
      // doit pas interrompre une synthèse longue qui progresse normalement.
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

      const audioBlob = await response.blob();
      if (controller.signal.aborted || generation !== playbackGenerationRef.current || !mountedRef.current) return;

      audioUrl = URL.createObjectURL(audioBlob);
      audio = new Audio(audioUrl);
      audioRef.current = audio;

      const finishAudio = () => {
        if (audioSettled) return;
        audioSettled = true;
        URL.revokeObjectURL(audioUrl);
        if (audioRef.current === audio) audioRef.current = null;
        finishPlayback(generation);
      };
      audio.onended = finishAudio;
      audio.onerror = finishAudio;

      await audio.play();
    } catch (error) {
      if (generation === playbackGenerationRef.current && mountedRef.current) {
        console.error('TTS error:', error);
        audio?.pause();
        if (audioRef.current === audio) audioRef.current = null;
        if (audioUrl && !audioSettled) URL.revokeObjectURL(audioUrl);
        toast("La lecture vocale est momentanément indisponible.");
        finishPlayback(generation);
      }
    } finally {
      clearTimeout(timeoutId);
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
    }
  }, [finishPlayback]);

  const playNextInQueueRef = useRef(playNextInQueue);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- référence du callback récursif de la file audio.
    playNextInQueueRef.current = playNextInQueue;
  });

  const speak = useCallback(async (text: string) => {
    if (!voiceEnabled || !text.trim()) return;
    const chunks = splitTextForSpeech(text);
    if (chunks.length === 0) return;

    audioQueueRef.current.push(...chunks);
    if (!isPlayingRef.current) void playNextInQueue();
  }, [voiceEnabled, playNextInQueue]);

  const stopSpeaking = useCallback(() => {
    playbackGenerationRef.current += 1;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    audioQueueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    isPlayingRef.current = false;
    if (mountedRef.current) setIsSpeaking(false);
  }, []);

  // getUserMedia reste le premier appel asynchrone pour préserver le geste utilisateur.
  const doStartListening = useCallback(async () => {
    if (listeningAttemptRef.current || acceptScribeEventsRef.current) return;
    listeningAttemptRef.current = true;
    scribeRef.current?.clearTranscripts();
    setIsConnecting(true);

    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      if (!listeningAttemptRef.current) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Authentication required');
      if (!listeningAttemptRef.current) return;

      const controller = new AbortController();
      scribeTokenAbortRef.current = controller;
      const tokenTimeoutId = setTimeout(() => controller.abort(), SCRIBE_TOKEN_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(SCRIBE_TOKEN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(tokenTimeoutId);
        if (scribeTokenAbortRef.current === controller) scribeTokenAbortRef.current = null;
      }

      if (!response.ok) throw new Error('Failed to get scribe token');
      const data: unknown = await response.json();
      const tokenData = data && typeof data === 'object'
        ? data as Record<string, unknown>
        : null;
      if (typeof tokenData?.token !== 'string' || !tokenData.token) throw new Error('No token received');
      if (!listeningAttemptRef.current) return;

      acceptScribeEventsRef.current = true;
      scribeConnectionTimeoutRef.current = setTimeout(() => {
        if (!acceptScribeEventsRef.current) return;
        acceptScribeEventsRef.current = false;
        scribeRef.current?.disconnect();
        resetListeningState();
        toast("La connexion au micro a expiré. Vérifie l'autorisation puis réessaie.");
      }, SCRIBE_CONNECTION_TIMEOUT_MS);

      await scribe.connect({
        token: tokenData.token,
        enableLogging: tokenData.enableLogging !== false,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (error) {
      const wasCancelled = !listeningAttemptRef.current;
      acceptScribeEventsRef.current = false;
      resetListeningState();
      if (wasCancelled) return;

      console.error('Failed to start listening:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        toast("Accès au micro refusé. Autorise le micro dans les réglages de ton navigateur pour utiliser le mode vocal.");
      } else {
        toast("Impossible de démarrer le mode vocal. Vérifie ta connexion et réessaie.");
      }
    }
  }, [resetListeningState, scribe]);

  const toggleVoice = useCallback(() => {
    const newState = !voiceEnabled;
    setVoiceEnabled(newState);
    if (!newState) {
      stopSpeaking();
      stopListening();
    }
  }, [voiceEnabled, stopSpeaking, stopListening]);

  const enableAndListen = useCallback(() => {
    setVoiceEnabled(true);
    void doStartListening();
  }, [doStartListening]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      playbackGenerationRef.current += 1;
      ttsAbortRef.current?.abort();
      scribeTokenAbortRef.current?.abort();
      clearScribeConnectionTimeout();
      clearScribeInactivityTimeout();
      audioQueueRef.current = [];
      audioRef.current?.pause();
      if (audioRef.current) URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
      isPlayingRef.current = false;
      acceptScribeEventsRef.current = false;
      scribeRef.current?.disconnect();
    };
  }, [clearScribeConnectionTimeout, clearScribeInactivityTimeout]);

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
