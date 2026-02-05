import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/layout/Layout";

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ArticleTypeSelection = lazy(() => import("./pages/ArticleTypeSelection"));
const ArticleGenerator = lazy(() => import("./pages/ArticleGenerator"));
const ArticlesList = lazy(() => import("./pages/ArticlesList"));
const ProjectsList = lazy(() => import("./pages/ProjectsList"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AuthorityPlanner = lazy(() => import("./pages/AuthorityPlanner"));
const NewsAgents = lazy(() => import("./pages/NewsAgents"));
const CreateNewsAgent = lazy(() => import("./pages/CreateNewsAgent"));
const WordPressPlugin = lazy(() => import("./pages/WordPressPlugin"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Minimal loading fallback
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
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
                <Route path="/authority-planner" element={<AuthorityPlanner />} />
                <Route path="/news-agents" element={<NewsAgents />} />
                <Route path="/news-agents/new" element={<CreateNewsAgent />} />
                <Route path="/projects" element={<ProjectsList />} />
                <Route path="/internal-links" element={<Dashboard />} />
                <Route path="/topical-maps" element={<Dashboard />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/wordpress-plugin" element={<WordPressPlugin />} />
                <Route path="/help" element={<Dashboard />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
