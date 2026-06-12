import { Suspense, lazy } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageTransition } from "@/components/layout/PageTransition";
import { OfflineBanner } from "@/components/OfflineBanner";
import { InstallBanner } from "@/components/InstallBanner";

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

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/auth" element={<PageTransition><Auth /></PageTransition>} />
          <Route path="/home" element={
            <ProtectedRoute>
              <PageTransition><Home /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <PageTransition><Dashboard /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/recipes/new" element={
            <ProtectedRoute>
              <PageTransition><RecipeNew /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/recipes/:id" element={
            <ProtectedRoute>
              <PageTransition><RecipeDetail /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/recipes/:id/edit" element={
            <ProtectedRoute>
              <PageTransition><RecipeEdit /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <PageTransition><Profile /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="/meal-planning" element={
            <ProtectedRoute>
              <PageTransition><MealPlanning /></PageTransition>
            </ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>

      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <AnimatedRoutes />
            <OfflineBanner />
            <InstallBanner />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
