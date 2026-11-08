import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const fixture = fileURLToPath(new URL('.', import.meta.url));

// Aperçu déterministe : les composants de production, sans compte ni service distant.
export default defineConfig({
  root: fixture,
  publicDir: `${root}/public`,
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: '@/hooks/useHomeChat', replacement: `${fixture}home-chat.ts` },
    { find: '@/hooks/useVoiceMode', replacement: `${fixture}voice.ts` },
    { find: '@/components/cooking/CookingModeContainer', replacement: `${fixture}cooking.tsx` },
    { find: '@', replacement: `${root}/src` },
  ] },
  server: { host: '127.0.0.1', port: 8081, strictPort: true, fs: { allow: [root] } },
});
