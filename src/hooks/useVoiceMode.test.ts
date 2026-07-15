import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks des dépendances externes du hook ---

const scribeConnect = vi.fn().mockResolvedValue(undefined);
const scribeDisconnect = vi.fn();

vi.mock('@elevenlabs/react', () => ({
  useScribe: () => ({
    connect: scribeConnect,
    disconnect: scribeDisconnect,
    partialTranscript: '',
  }),
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

describe('useVoiceMode', () => {
  beforeEach(() => {
    scribeConnect.mockClear();
    scribeDisconnect.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: 'scribe-token' }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
});
