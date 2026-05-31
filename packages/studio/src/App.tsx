import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";

/* Lazy-loaded route pages */
import { lazy, Suspense } from "react";

const ChatPage = lazy(() => import("./pages/ChatPage"));
const ConfigPage = lazy(() => import("./pages/ConfigPage"));
const SelfModifyPage = lazy(() => import("./pages/SelfModifyPage"));
const ObservabilityPage = lazy(() => import("./pages/ObservabilityPage"));
const CostsPage = lazy(() => import("./pages/CostsPage"));

function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-gray-500">
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <MainLayout>
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
    </MainLayout>
  );
}
