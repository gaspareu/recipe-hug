import { Suspense, lazy } from "react";
import * as Sentry from "@sentry/react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  useOutlet,
  useLocation,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageTransition } from "@/components/layout/PageTransition";
import { OfflineBanner } from "@/components/OfflineBanner";
import { RouteError } from "@/components/RouteError";
import { Toaster } from '@/components/ui/sonner';

// Lazy load pages for code-splitting
const Auth = lazy(() => import("./pages/Auth"));
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const RecipeDetail = lazy(() => import("./pages/RecipeDetail"));
const RecipeEdit = lazy(() => import("./pages/RecipeEdit"));
const RecipeNew = lazy(() => import("./pages/RecipeNew"));
const Profile = lazy(() => import("./pages/Profile"));
const MealPlanning = lazy(() => import("./pages/MealPlanning"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const SuspenseFallback = () => (
  <div className="min-h-[100dvh] flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

// Outlet animé : conserve les transitions de page (AnimatePresence keyé par pathname)
// tout en s'appuyant sur le data router (requis par useBlocker dans RecipeEdit).
const AnimatedOutlet = () => {
  const location = useLocation();
  const element = useOutlet();
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <AnimatePresence mode="wait">
        <div key={location.pathname} className="contents">
          {element}
        </div>
      </AnimatePresence>
    </Suspense>
  );
};

const RootLayout = () => (
  <>
    <AnimatedOutlet />
    <OfflineBanner />
  </>
);

const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouter(createBrowserRouter);

const router = sentryCreateBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <Navigate to="/home" replace /> },
      { path: "/auth", element: <PageTransition><Auth /></PageTransition> },
      {
        path: "/home",
        element: <ProtectedRoute><PageTransition><Home /></PageTransition></ProtectedRoute>,
      },
      {
        path: "/dashboard",
        element: <ProtectedRoute><PageTransition><Dashboard /></PageTransition></ProtectedRoute>,
      },
      {
        path: "/recipes/new",
        element: <ProtectedRoute><PageTransition><RecipeNew /></PageTransition></ProtectedRoute>,
      },
      {
        path: "/recipes/:id",
        element: <ProtectedRoute><PageTransition><RecipeDetail /></PageTransition></ProtectedRoute>,
      },
      {
        path: "/recipes/:id/edit",
        element: <ProtectedRoute><PageTransition><RecipeEdit /></PageTransition></ProtectedRoute>,
      },
      {
        path: "/profile",
        element: <ProtectedRoute><PageTransition><Profile /></PageTransition></ProtectedRoute>,
      },
      {
        path: "/meal-planning",
        element: <ProtectedRoute><PageTransition><MealPlanning /></PageTransition></ProtectedRoute>,
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
          {/* Sans ce conteneur, tous les appels `toast.*` sont silencieux :
              l'action réussit mais l'utilisateur n'en voit aucune trace. */}
          <Toaster />
        </ThemeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
