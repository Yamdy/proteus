import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  children: ReactNode;
}

const variantClasses = {
  primary:
    "bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-[0_0_12px_rgba(34,211,238,0.15)]",
  secondary:
    "border border-white/[0.06] bg-surface-100/60 hover:bg-surface-200/80 text-gray-300",
  danger: "bg-red-600 hover:bg-red-500 text-white",
};

export function ActionButton({
  variant = "primary",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ActionButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {loading ? "Saving..." : children}
    </button>
  );
}
