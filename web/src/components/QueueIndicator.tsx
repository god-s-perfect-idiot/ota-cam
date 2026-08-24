import type { QueueStats } from '../lib/uploadQueue.js';

interface Props {
  stats: QueueStats | null;
  onRetry: () => void;
}

export function QueueIndicator({ stats, onRetry }: Props) {
  if (!stats) return null;

  const { pending, failed, online } = stats;

  if (failed > 0) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="rounded-sm bg-red-600/90 px-2.5 py-1 font-stamp text-[10px] uppercase tracking-wider text-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
      >
        {failed} stuck · retry
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
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-film-amber" />
        saving {pending}
      </Pill>
    );
  }

  return <Pill tone="ok">saved</Pill>;
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
      className={`flex items-center rounded-sm bg-black/50 px-2.5 py-1 font-stamp text-[10px] uppercase tracking-wider shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
