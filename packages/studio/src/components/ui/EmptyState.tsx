import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && <div className="text-gray-600">{icon}</div>}
      <p className="text-sm font-medium text-gray-400">{title}</p>
      {description && (
        <p className="max-w-xs text-xs text-gray-600">{description}</p>
      )}
    </div>
  );
}
