<!-- Generated: 2026-03-18 | Files scanned: 107 | Token estimate: ~750 -->

# Frontend — recipe-hug

## Page Tree (src/pages/)
```
/ (Home.tsx)              — chat IA principal
/dashboard (Dashboard.tsx, 184L)
/auth (Auth.tsx, 338L)    — login/signup
/recipe/new (RecipeNew.tsx)          — création recette [NEW]
/recipe/:id (RecipeDetail.tsx, 329L)
/recipe/:id/edit (RecipeEdit.tsx, 272L)
/profile (Profile.tsx, 263L)
/meal-planning (MealPlanning.tsx, 251L)
/* (NotFound.tsx)
```

## Component Hierarchy
```
App
└── AuthProvider (useAuth)
    └── MainLayout (Header + outlet)
        ├── InstallBanner (PWA install prompt) [NEW]
        ├── OfflineBanner (réseau hors-ligne) [NEW]
        ├── Home → ChatInterface → VoiceControls, SoundWaveIndicator
        ├── Dashboard → RecipeCard[]
        ├── RecipeNew [NEW]
        ├── RecipeDetail → IngredientChecklist, RecipeVersionHistory
        ├── RecipeEdit → IngredientForm, RecipeStepsForm, RecipeImageSection
        ├── Profile → AIProviderSettings⚠, CulinaryPreferencesEditor⚠,
        │            WebhookIntegrationContent, ThemeSettings
        └── MealPlanning → GroceryListSheet
```
⚠ Fichiers trop grands (>500L) — candidats à découper

## State Management
- **Auth**: `useAuth` (Context + AuthProvider) — protège routes via `ProtectedRoute`
- **Server state**: TanStack Query — `useRecipes`, `useRecipeVersions`
- **AI config**: `useAISettings` (280L) — provider, modèles, clés chiffrées
- **Chat**: `useHomeChat` → `useChatEngine` (streaming SSE)
- **Voice**: `useVoiceMode` (241L) — ElevenLabs STT/TTS
- **PWA**: `useInstallPrompt` (install banner) + `useNetworkStatus` (offline banner) [NEW]
- **UI**: `useTheme`, `useUserPreferences`, `useSwipeNavigation`

## Key Hooks (src/hooks/)
| Hook | Lines | Rôle |
|------|-------|------|
| `useChatEngine.ts` | 299 | Streaming IA, gestion messages |
| `useAISettings.ts` | 280 | Config IA par user (provider, modèle, clés) |
| `useVoiceMode.ts` | 241 | STT/TTS ElevenLabs |
| `useRecipes.ts` | 226 | CRUD recettes (TanStack Query) |
| `useUserPreferences.ts` | 224 | Préférences culinaires |
| `useHomeChat.ts` | 209 | Chat home, orchestration |
| `useAuth.tsx` | 142 | Auth Supabase, session |
| `useRecipeChat.ts` | 133 | Chat dans contexte recette |
| `useRecipeVersions.ts` | 133 | Versioning recettes |
| `useCookidooExport.ts` | 115 | Export Cookidoo async : déclenche puis interroge le journal (2 s, abandon à 2 min) |
| `useInstallPrompt.ts` | — | PWA beforeinstallprompt event [NEW] |
| `useNetworkStatus.ts` | — | navigator.onLine + events [NEW] |

## UI Components
31 composants shadcn/ui dans `src/components/ui/` (Button, Dialog, Form, Select, Sheet, Tabs…)
