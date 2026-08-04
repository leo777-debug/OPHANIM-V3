"use client";

export default function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ops-error-state" role="alert">
      <p>Data unavailable</p>
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          className="ops-button ops-button--secondary"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  );
}
