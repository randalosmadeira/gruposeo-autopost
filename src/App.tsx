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
const Dashboard = lazy(() => import("./pages/DashboardNew"));
const ContentCalendar = lazy(() => import("./pages/ContentCalendar"));
const ArticleTypeSelection = lazy(() => import("./pages/ArticleTypeSelection"));
const ArticleGenerator = lazy(() => import("./pages/ArticleGenerator"));
const ArticleGeneratorV2 = lazy(() => import("./pages/ArticleGeneratorV2"));
const BulkArticleGenerator = lazy(() => import("./pages/BulkArticleGenerator"));
const ArticlesList = lazy(() => import("./pages/ArticlesList"));
const ArticleViewPage = lazy(() => import("./pages/ArticleViewPage"));
const ArticleEditPage = lazy(() => import("./pages/ArticleEditPage"));
const ProjectsList = lazy(() => import("./pages/ProjectsList"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AuthorityPlanner = lazy(() => import("./pages/AuthorityPlanner"));
const NewsAgents = lazy(() => import("./pages/NewsAgents"));
const CreateNewsAgent = lazy(() => import("./pages/CreateNewsAgent"));
const WordPressPlugin = lazy(() => import("./pages/WordPressPlugin"));
const WordPressMonitor = lazy(() => import("./pages/WordPressMonitor"));
const LandingPageGenerator = lazy(() => import("./pages/LandingPageGenerator"));
const BulkSalesPagesGenerator = lazy(() => import("./pages/BulkSalesPagesGenerator"));
const Auth = lazy(() => import("./pages/Auth"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const NewsRewriter = lazy(() => import("./pages/NewsRewriter"));
const BulkKeywordGenerator = lazy(() => import("./pages/BulkKeywordGenerator"));
const NotFound = lazy(() => import("./pages/NotFound"));
const QueueMonitor = lazy(() => import("./pages/QueueMonitor"));
const Academy = lazy(() => import("./pages/Academy"));
const InternalLinking = lazy(() => import("./pages/InternalLinking"));
const AIChat = lazy(() => import("./pages/AIChat"));
const SystemPrompts = lazy(() => import("./pages/SystemPrompts"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,       // 1 min - avoid refetching data that's still fresh
      gcTime: 300000,          // 5 min - keep cache longer
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

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
                <Route path="/calendar" element={<ContentCalendar />} />
                <Route path="/academia" element={<Academy />} />
              <Route path="/articles" element={<ArticlesList />} />
                <Route path="/articles/types" element={<ArticleTypeSelection />} />
                <Route path="/articles/new" element={<ArticleGeneratorV2 />} />
                <Route path="/articles/new/:type" element={<ArticleGenerator />} />
                <Route path="/articles/bulk" element={<BulkArticleGenerator />} />
                <Route path="/articles/:id/edit" element={<ArticleEditPage />} />
                <Route path="/articles/:id" element={<ArticleViewPage />} />
                <Route path="/landing-page/new" element={<LandingPageGenerator />} />
                <Route path="/landing-page/bulk" element={<BulkSalesPagesGenerator />} />
                <Route path="/authority-planner" element={<AuthorityPlanner />} />
                <Route path="/news-agents" element={<NewsAgents />} />
                <Route path="/news-agents/new" element={<CreateNewsAgent />} />
                <Route path="/projects" element={<ProjectsList />} />
                <Route path="/internal-linking" element={<InternalLinking />} />
                <Route path="/internal-links" element={<InternalLinking />} />
                <Route path="/topical-maps" element={<Dashboard />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/wordpress-plugin" element={<WordPressPlugin />} />
                <Route path="/wordpress-monitor" element={<WordPressMonitor />} />
                <Route path="/queue-monitor" element={<QueueMonitor />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/news-rewriter" element={<NewsRewriter />} />
                <Route path="/bulk-generator" element={<BulkKeywordGenerator />} />
                <Route path="/ai-chat" element={<AIChat />} />
                <Route path="/system-prompts" element={<SystemPrompts />} />
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
