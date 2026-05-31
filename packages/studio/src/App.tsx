import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";
import { ErrorBoundary } from "./lib/ErrorBoundary";

/* Lazy-loaded route pages */
import { lazy, Suspense } from "react";

const ChatPage = lazy(() => import("./pages/ChatPage"));
const ConfigPage = lazy(() => import("./pages/ConfigPage"));
const SelfModifyPage = lazy(() => import("./pages/SelfModifyPage"));
const ObservabilityPage = lazy(() => import("./pages/ObservabilityPage"));
const CostsPage = lazy(() => import("./pages/CostsPage"));

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
        <span className="text-xs text-gray-600 font-mono">Loading...</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MainLayout>
      <ErrorBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/config/level0" element={<ConfigPage />} />
            <Route path="/config/level1" element={<ConfigPage />} />
            <Route path="/config/level2" element={<ConfigPage />} />
            <Route path="/self-modify" element={<SelfModifyPage />} />
            <Route path="/observability" element={<ObservabilityPage />} />
            <Route path="/costs" element={<CostsPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  );
}
