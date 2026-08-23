import type { QueueStats } from '../lib/uploadQueue.js';

interface Props {
  stats: QueueStats | null;
  onRetry: () => void;
}

/**
 * Deliberately reports only counts and sync state. Showing thumbnails here
 * would undo the whole point of a disposable camera.
 */
export function QueueIndicator({ stats, onRetry }: Props) {
  if (!stats) return null;

  const { pending, failed, online } = stats;

  if (failed > 0) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-red-500/85 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm"
      >
        {failed} stuck · tap to retry
      </button>
    );
  }

  if (!online) {
    return (
      <Pill tone="warn">
        offline{pending > 0 ? ` · ${pending} waiting` : ''}
      </Pill>
    );
  }

  if (pending > 0) {
    return (
      <Pill tone="busy">
        <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-film-amber" />
        saving {pending}
      </Pill>
    );
  }

  return <Pill tone="ok">saved to drive</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: 'ok' | 'busy' | 'warn';
  children: React.ReactNode;
}) {
  const tones = {
    ok: 'text-emerald-300/90',
    busy: 'text-film-amber',
    warn: 'text-amber-200',
  } as const;
  return (
    <span
      className={`flex items-center rounded-full bg-black/45 px-3 py-1.5 text-xs backdrop-blur-sm ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
