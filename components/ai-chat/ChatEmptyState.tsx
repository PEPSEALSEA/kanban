export default function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border-subtle bg-card shadow-sm">
        <svg
          className="h-6 w-6 text-primary-hover"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a3.375 3.375 0 1 1 6.75 0 3.375 3.375 0 0 1-6.75 0ZM12 2.25c-2.429 0-4.817.178-7.152.521C2.87 3.061 1.5 4.582 1.5 6.375V17.25c0 1.793 1.37 3.314 3.348 3.604 2.335.343 4.723.521 7.152.521s4.817-.178 7.152-.521c1.978-.29 3.348-1.811 3.348-3.604V6.375c0-1.793-1.37-3.314-3.348-3.604A48.714 48.714 0 0 0 12 2.25Z"
          />
        </svg>
      </div>
      <h2 className="mb-2 text-lg font-bold tracking-tight text-text-main">How can I help you study?</h2>
      <p className="max-w-sm text-sm text-text-muted">
        Ask about homework, summarize a topic, or explore ideas. I will show my thinking steps as I work.
      </p>
    </div>
  );
}
