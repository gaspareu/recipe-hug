import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks des dépendances externes du hook ---

const scribeConnect = vi.fn().mockResolvedValue(undefined);
const scribeDisconnect = vi.fn();

// Options passées à useScribe au dernier rendu : permet de déclencher
// manuellement onCommittedTranscript (Scribe est simulé, pas de vrai micro).
let capturedScribeOptions: {
  onCommittedTranscript?: (data: { text?: string }) => void;
} | null = null;

vi.mock('@elevenlabs/react', () => ({
  useScribe: (options: typeof capturedScribeOptions) => {
    capturedScribeOptions = options;
    return {
      connect: scribeConnect,
      disconnect: scribeDisconnect,
      partialTranscript: '',
    };
  },
  CommitStrategy: { VAD: 'vad' },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: { access_token: 'token-123' } },
          error: null,
        }),
      ),
    },
  },
}));

vi.mock('@/components/ui/sonner', () => ({ toast: vi.fn() }));

import { useVoiceMode } from './useVoiceMode';
import { toast } from '@/components/ui/sonner';

/** Piste micro factice exposant un espion sur `stop()`. */
function makeTrack() {
  return { stop: vi.fn() };
}

/** Installe un `navigator.mediaDevices.getUserMedia` renvoyant un flux à pistes espionnées. */
function installGetUserMedia(tracks: Array<{ stop: ReturnType<typeof vi.fn> }>) {
  const getUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => tracks,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  });
  return getUserMedia;
}

/** `Audio` factice : jsdom n'implémente ni la lecture audio ni les blob URLs. */
const audioPlay = vi.fn().mockResolvedValue(undefined);
class FakeAudio {
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(src: string) {
    this.src = src;
  }
  play() {
    return audioPlay();
  }
  pause() {}
}

/** `fetch` par défaut : blob audio pour le TTS, jeton JSON pour Scribe. */
function installFetch() {
  return vi.fn().mockImplementation((url: string) =>
    String(url).includes('elevenlabs-tts')
      ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['audio'])) })
      : Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'scribe-token' }) }),
  );
}

/** Retrouve l'appel `fetch` dirigé vers l'edge function TTS, s'il a eu lieu. */
function findTtsCall() {
  return (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
    ([u]) => String(u).includes('elevenlabs-tts'),
  );
}

describe('useVoiceMode', () => {
  beforeEach(() => {
    scribeConnect.mockClear();
    scribeDisconnect.mockClear();
    audioPlay.mockClear();
    (toast as unknown as ReturnType<typeof vi.fn>).mockClear();
    capturedScribeOptions = null;

    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', installFetch());
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // --- STT : permission micro et connexion Scribe ---

  it('arrête les pistes du flux micro obtenu par getUserMedia (pas de captation orpheline)', async () => {
    const track = makeTrack();
    installGetUserMedia([track]);

    const { result } = renderHook(() => useVoiceMode());

    await act(async () => {
      await result.current.startListening();
    });

    // Le flux de pré-vol (permission) ne doit pas rester "live" : Scribe ouvre le sien.
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(scribeConnect).toHaveBeenCalledTimes(1);
  });

  it('déconnecte Scribe au démontage (pas de captation micro orpheline)', async () => {
    installGetUserMedia([makeTrack()]);

    const { result, unmount } = renderHook(() => useVoiceMode());

    await act(async () => {
      await result.current.startListening();
    });

    scribeDisconnect.mockClear();
    unmount();

    // Sans cleanup, Scribe resterait connecté après le démontage du composant.
    expect(scribeDisconnect).toHaveBeenCalledTimes(1);
  });

  it('déclenche onTranscript et arrête l\'écoute quand Scribe valide une transcription', async () => {
    installGetUserMedia([makeTrack()]);
    const onTranscript = vi.fn();

    const { result } = renderHook(() => useVoiceMode(onTranscript));

    await act(async () => {
      await result.current.startListening();
    });

    scribeDisconnect.mockClear();

    // Simule une transcription validée par la VAD de Scribe.
    act(() => {
      capturedScribeOptions?.onCommittedTranscript?.({ text: 'ajoute du sel' });
    });

    expect(onTranscript).toHaveBeenCalledWith('ajoute du sel');
    // La transcription validée doit couper l'écoute (une phrase = un tour).
    expect(scribeDisconnect).toHaveBeenCalledTimes(1);
  });

  it('affiche un toast explicite quand l\'accès micro est refusé', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useVoiceMode());

    await act(async () => {
      await result.current.startListening();
    });

    expect(toast).toHaveBeenCalledWith(expect.stringContaining('micro'));
    expect(scribeConnect).not.toHaveBeenCalled();
    expect(result.current.isConnecting).toBe(false);
  });

  it('n\'ouvre pas Scribe et prévient l\'utilisateur si le jeton STT échoue', async () => {
    installGetUserMedia([makeTrack()]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { result } = renderHook(() => useVoiceMode());

    await act(async () => {
      await result.current.startListening();
    });

    expect(scribeConnect).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalled();
    expect(result.current.isConnecting).toBe(false);
  });

  // --- TTS : synthèse vocale ---

  it('n\'appelle pas le TTS tant que le mode vocal est désactivé', async () => {
    const { result } = renderHook(() => useVoiceMode());

    await act(async () => {
      await result.current.speak('Bonjour');
    });

    expect(findTtsCall()).toBeUndefined();
    expect(result.current.isSpeaking).toBe(false);
  });

  it('envoie le texte nettoyé au TTS avec le jeton d\'auth, puis joue l\'audio', async () => {
    installGetUserMedia([makeTrack()]);

    const { result } = renderHook(() => useVoiceMode());

    // Active le mode vocal (voiceEnabled est nécessaire pour que speak agisse).
    act(() => {
      result.current.toggleVoice();
    });

    await act(async () => {
      await result.current.speak('Bonjour **le** monde');
    });

    // speak() n'attend pas la file audio (lecture en tâche de fond) → poll jusqu'à la lecture.
    await waitFor(() => {
      expect(audioPlay).toHaveBeenCalledTimes(1);
    });

    const ttsCall = findTtsCall();
    expect(ttsCall).toBeTruthy();

    const [, init] = ttsCall as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
    // Le markdown doit être retiré avant l'envoi à ElevenLabs.
    expect(JSON.parse(init.body as string).text).toBe('Bonjour le monde');
    expect(result.current.isSpeaking).toBe(true);
  });

  it('reste résilient si le TTS échoue (isSpeaking revient à false, pas de crash)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        String(url).includes('elevenlabs-tts')
          ? Promise.resolve({ ok: false, status: 500 })
          : Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 't' }) }),
      ),
    );

    const { result } = renderHook(() => useVoiceMode());

    act(() => {
      result.current.toggleVoice();
    });

    await act(async () => {
      await result.current.speak('Bonjour');
    });

    // Le reset de isSpeaking passe par un setTimeout(0) dans le catch : poll
    // jusqu'à ce que la file s'auto-vide, plutôt qu'une attente fixe (flaky en CI).
    await waitFor(() => {
      expect(result.current.isSpeaking).toBe(false);
    });
  });

  it('désactiver le mode vocal coupe la lecture et l\'écoute', async () => {
    installGetUserMedia([makeTrack()]);

    const { result } = renderHook(() => useVoiceMode());

    act(() => {
      result.current.toggleVoice(); // voiceEnabled = true
    });

    await act(async () => {
      await result.current.startListening();
    });

    scribeDisconnect.mockClear();

    act(() => {
      result.current.toggleVoice(); // voiceEnabled = false → stopSpeaking + stopListening
    });

    expect(scribeDisconnect).toHaveBeenCalled();
    expect(result.current.voiceEnabled).toBe(false);
  });
});
