'use client';

type AudioAccessNoticeProps = {
  hasAudio?: boolean;
  canAccessAudio: boolean;
  isLoggedIn: boolean;
  variant?: 'classic' | 'experimental';
};

export default function AudioAccessNotice({
  hasAudio,
  canAccessAudio,
  isLoggedIn,
  variant = 'classic',
}: AudioAccessNoticeProps) {
  if (!hasAudio || canAccessAudio) return null;

  const message = isLoggedIn
    ? 'This content includes audio, but your account is not on the AudioPermissions list. Contact an admin for access.'
    : 'This content includes audio. Sign in with Google (top navigation) to listen.';

  if (variant === 'experimental') {
    return (
      <div
        style={{
          marginBottom: 20,
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid var(--exp-hairline)',
          background: 'var(--exp-surface-2)',
          fontSize: 13,
          color: 'var(--exp-ink-muted)',
          lineHeight: 1.5,
        }}
      >
        🎵 {message}
      </div>
    );
  }

  return (
    <div className="mb-10 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-slate-600 leading-relaxed">
      🎵 {message}
    </div>
  );
}
