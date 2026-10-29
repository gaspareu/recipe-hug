const noop = () => {};
export const useVoiceMode = () => ({
  voiceEnabled: false, isSpeaking: false, isListening: false, isConnecting: false,
  toggleVoice: noop, speak: noop, stopSpeaking: noop, startListening: noop,
  stopListening: noop, enableAndListen: noop, partialTranscript: '',
});
