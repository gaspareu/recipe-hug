<!-- Generated: 2026-03-17 | Files scanned: 1 (package.json) | Token estimate: ~350 -->

# Dependencies — recipe-hug

## External Services
| Service | Usage | Config |
|---------|-------|--------|
| Supabase | Auth, DB (PostgreSQL), Storage, Edge Functions | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| ElevenLabs | TTS + STT (voice mode) | Clé via edge function `elevenlabs-scribe-token` |
| Lovable | AI provider par défaut | Clé interne (non exposée) |
| OpenAI | AI provider optionnel | Clé user chiffrée en DB |
| Anthropic | AI provider optionnel | Clé user chiffrée en DB |
| Gemini | AI provider optionnel | Clé user chiffrée en DB |

## Frontend Libraries
| Package | Version | Rôle |
|---------|---------|------|
| react | 18.3.1 | UI framework |
| react-router-dom | 7.12.0 | Routing |
| @tanstack/react-query | 5.83.0 | Server state |
| @supabase/supabase-js | 2.89.0 | Supabase client |
| @elevenlabs/react | 0.12.3 | Voice (TTS/STT) |
| framer-motion | latest | Animations |
| react-hook-form + zod | latest | Forms + validation |
| tailwindcss | 3.4.17 | Styling |
| radix-ui/* | latest | UI primitives (15 packages) |
| lucide-react | latest | Icons |
| next-themes | latest | Dark/light mode |
| react-markdown | latest | Rendu markdown chat |
| sonner | latest | Toast notifications |
| vite-plugin-pwa | latest | PWA manifest + service worker |
| date-fns | latest | Dates |

## Dev Tools
| Package | Version | Rôle |
|---------|---------|------|
| vite | 5.4.19 | Build + dev server |
| vitest | 4.0.18 | Tests unitaires |
| @testing-library/react | latest | Tests composants |
| eslint | 9.32.0 | Linting |
| typescript | latest | Types |
