interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between border-b border-red-500/20 bg-red-500/5 px-6 py-2 text-xs text-red-400">
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-4 text-red-400/60 hover:text-red-400"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
