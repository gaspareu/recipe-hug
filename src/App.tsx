import { Suspense, lazy } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Lazy load pages for code-splitting
const Auth = lazy(() => import("./pages/Auth"));
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const RecipeDetail = lazy(() => import("./pages/RecipeDetail"));
const RecipeEdit = lazy(() => import("./pages/RecipeEdit"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/home" element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                <Route path="/recipes/new" element={<Navigate to="/home" replace />} />
                <Route path="/recipes/:id" element={
                  <ProtectedRoute>
                    <RecipeDetail />
                  </ProtectedRoute>
                } />
                <Route path="/recipes/:id/edit" element={
                  <ProtectedRoute>
                    <RecipeEdit />
                  </ProtectedRoute>
                } />
                <Route path="/profile" element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                } />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
