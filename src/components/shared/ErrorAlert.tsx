interface ErrorAlertProps {
  messages: string[];
  dismissLabel: string;
  onDismiss: () => void;
}

export default function ErrorAlert({ messages, dismissLabel, onDismiss }: ErrorAlertProps) {
  if (messages.length === 0) return null;

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-tint)] px-4 py-3 text-sm text-[var(--danger)]"
    >
      <div className="space-y-1">
        {messages.map((msg, idx) => (
          <p key={`${idx}-${msg}`} className="m-0 font-medium leading-snug">
            {msg}
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--danger)] px-2.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--bg-card)]"
      >
        {dismissLabel}
      </button>
    </div>
  );
}
