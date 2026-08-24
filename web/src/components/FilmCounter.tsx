import { useEffect, useRef, useState } from 'react';

interface Props {
  count: number;
}

const digitClass =
  'absolute inset-0 flex items-center justify-center font-stamp text-xl font-bold leading-none text-[#0a0a0a]';

function RollingDigit({ value }: { value: string }) {
  const [phase, setPhase] = useState<'idle' | 'rolling'>('idle');
  const [from, setFrom] = useState(value);
  const [to, setTo] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (value === prev.current) return;

    setFrom(prev.current);
    setTo(value);
    setPhase('rolling');
    prev.current = value;

    const timer = window.setTimeout(() => setPhase('idle'), 420);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative h-[1.25rem] w-[0.72rem] overflow-hidden" style={{ perspective: '140px' }}>
      <div className="relative h-full w-full" style={{ transformStyle: 'preserve-3d' }}>
        {phase === 'rolling' ? (
          <>
            <span
              key={`out-${from}-${to}`}
              aria-hidden
              className={`${digitClass} animate-digit-roll-out`}
              style={{ transformOrigin: '50% 100%', backfaceVisibility: 'hidden' }}
            >
              {from}
            </span>
            <span
              key={`in-${from}-${to}`}
              className={`${digitClass} animate-digit-roll-in`}
              style={{ transformOrigin: '50% 0%', backfaceVisibility: 'hidden' }}
            >
              {to}
            </span>
          </>
        ) : (
          <span className={digitClass}>
            {to}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Mechanical frame counter window with rolling digits, like a 35mm camera frame dial.
 */
export function FilmCounter({ count }: Props) {
  const digits = String(count).padStart(2, '0').split('');

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {/* Counter housing */}
        <div className="texture-metal rounded-sm px-2 py-1.5 shadow-[inset_0_2px_5px_rgba(0,0,0,0.7),0_1px_2px_rgba(0,0,0,0.4)]">
          {/* Glass window */}
          <div className="relative flex gap-[3px] overflow-hidden rounded-[2px] bg-[#f8f6f2] px-1.5 py-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.12),inset_0_-1px_2px_rgba(255,255,255,0.8)]">
            {/* Glass reflection */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent" />

            {/* Cylindrical drum shading */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[35%] bg-gradient-to-b from-black/[0.12] to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[35%] bg-gradient-to-t from-black/[0.12] to-transparent" />

            {digits.map((digit, i) => (
              <RollingDigit key={i} value={digit} />
            ))}
          </div>
        </div>

        {/* Frame label */}
        <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap font-stamp text-[7px] uppercase tracking-[0.2em] text-film-cream/30">
          frame
        </span>
      </div>
    </div>
  );
}
