import { useEffect } from "react";
import { useObservability } from "../hooks/useObservability";
import CostDashboard from "../components/observability/CostDashboard";

export default function CostsPage() {
  const {
    costs,
    loading,
    error,
    fetchCosts,
  } = useObservability();

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  return (
    <div data-testid="costs-page" className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-white">Costs</h1>
          <p className="text-xs text-gray-500">
            Token usage and cost breakdown by session, model, and turn
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-800 bg-red-950/30 px-6 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Dashboard */}
      <div className="flex-1 overflow-hidden">
        <CostDashboard
          costs={costs}
          loading={loading}
          onRefresh={() => fetchCosts()}
          onFilterSession={(sessionId) => {
            if (sessionId) {
              fetchCosts({ sessionId });
            } else {
              fetchCosts();
            }
          }}
        />
      </div>
    </div>
  );
}
