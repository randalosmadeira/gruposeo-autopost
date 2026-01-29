import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import ArticleTypeSelection from "./pages/ArticleTypeSelection";
import ArticleGenerator from "./pages/ArticleGenerator";
import ArticlesList from "./pages/ArticlesList";
import ProjectsList from "./pages/ProjectsList";
import SettingsPage from "./pages/SettingsPage";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/articles" element={<ArticlesList />} />
              <Route path="/articles/new" element={<ArticleTypeSelection />} />
              <Route path="/articles/new/:type" element={<ArticleGenerator />} />
              <Route path="/articles/bulk" element={<ArticleTypeSelection />} />
              <Route path="/projects" element={<ProjectsList />} />
              <Route path="/internal-links" element={<Dashboard />} />
              <Route path="/topical-maps" element={<Dashboard />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/help" element={<Dashboard />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
