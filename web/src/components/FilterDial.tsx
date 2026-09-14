import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  FILTERS,
  getFilter,
  nextFilterId,
  previousFilterId,
  type FilterId,
} from '../lib/filters.js';

interface Props {
  value: FilterId;
  onChange: (id: FilterId) => void;
  disabled?: boolean;
}

const SIZE = 78;
/** Label orbit radius from dial center. */
const LABEL_R = 24;

function angleForIndex(index: number): number {
  return (360 / FILTERS.length) * index;
}

/**
 * Camera-style mode dial for picking a photo filter. Drag to rotate, or tap
 * to advance — the active filter snaps under the fixed index mark at 12 o'clock.
 */
export function FilterDial({ value, onChange, disabled }: Props) {
  const filter = getFilter(value);
  const index = Math.max(0, FILTERS.findIndex((f) => f.id === value));
  const rotation = -angleForIndex(index);

  const drag = useRef<{
    pointerId: number;
    startAngle: number;
    startIndex: number;
    moved: boolean;
  } | null>(null);
  const dialRef = useRef<HTMLButtonElement>(null);

  const pointerAngle = useCallback((clientX: number, clientY: number) => {
    const el = dialRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    return (Math.atan2(y, x) * 180) / Math.PI;
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startAngle: pointerAngle(event.clientX, event.clientY),
      startIndex: index,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const delta = pointerAngle(event.clientX, event.clientY) - state.startAngle;
    if (Math.abs(delta) > 8) state.moved = true;

    const step = 360 / FILTERS.length;
    // Dragging clockwise advances the dial labels under the top mark.
    const steps = Math.round(delta / step);
    if (!state.moved) return;

    const nextIndex = (state.startIndex - steps + FILTERS.length * 8) % FILTERS.length;
    const nextId = FILTERS[nextIndex]!.id;
    if (nextId !== value) onChange(nextId);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;

    if (!state.moved) {
      onChange(nextFilterId(value));
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        {/* Fixed body index mark */}
        <span
          aria-hidden
          className="absolute left-1/2 top-[-2px] z-20 h-[7px] w-[3px] -translate-x-1/2 rounded-[1px] bg-film-amber shadow-[0_0_5px_rgba(255,176,32,0.55)]"
        />

        <button
          ref={dialRef}
          type="button"
          disabled={disabled}
          aria-label={`Filter: ${filter.name}. Tap or drag to change.`}
          aria-valuetext={filter.name}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              onChange(nextFilterId(value));
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              onChange(previousFilterId(value));
            }
          }}
          className="absolute inset-0 touch-none rounded-full disabled:opacity-40"
        >
          {/* Matte black metal dial */}
          <div
            className="absolute inset-0 rounded-full transition-transform duration-300 ease-out"
            style={{
              transform: `rotate(${rotation}deg)`,
              background: `
                repeating-conic-gradient(
                  from 0.5deg,
                  #3a3a3a 0deg 1.4deg,
                  #1a1a1a 1.4deg 2.8deg,
                  #2e2e2e 2.8deg 4deg,
                  #0e0e0e 4deg 5.4deg,
                  #323232 5.4deg 6.6deg,
                  #181818 6.6deg 8deg
                )
              `,
              boxShadow: `
                inset 0 1px 0 rgba(255,255,255,0.12),
                inset 0 -2px 3px rgba(0,0,0,0.7),
                0 2px 8px rgba(0,0,0,0.55)
              `,
            }}
          >
            {/* Matte black face */}
            <div
              className="absolute inset-[5px] overflow-hidden rounded-full"
              style={{
                background:
                  'radial-gradient(circle at 42% 32%, #2a2a2a 0%, #141414 52%, #0a0a0a 100%)',
                boxShadow: `
                  inset 0 1px 0 rgba(255,255,255,0.06),
                  inset 0 -2px 4px rgba(0,0,0,0.7),
                  0 0 0 1px rgba(255,255,255,0.06)
                `,
              }}
            >
              {/* Subtle ring */}
              <div className="absolute inset-[7px] rounded-full border border-white/10" />

              {/* Mode labels */}
              {FILTERS.map((item, i) => {
                const deg = angleForIndex(i);
                const accentClass =
                  item.accent === 'green'
                    ? 'text-[#5fbf4a] border-[#5fbf4a]/90'
                    : item.accent === 'tan'
                      ? 'text-[#c9a56a] border-[#c9a56a]/85'
                      : item.accent === 'boxed'
                        ? 'text-[#e8e4dc] border-[#e8e4dc]/70'
                        : 'text-[#e8e4dc] border-transparent';

                return (
                  <span
                    key={item.id}
                    className={`absolute left-1/2 top-1/2 flex h-[14px] w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2px] border font-sans text-[7.5px] font-bold leading-none tracking-tight ${accentClass}`}
                    style={{
                      // Bottom of each glyph faces the hub, like a DSLR mode dial.
                      transform: `rotate(${deg}deg) translateY(-${LABEL_R}px)`,
                    }}
                  >
                    {item.label}
                  </span>
                );
              })}

              {/* Matte center hub */}
              <div
                className="absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background: 'radial-gradient(circle at 38% 30%, #2c2c2c, #0d0d0d)',
                  boxShadow: `
                    inset 0 1px 0 rgba(255,255,255,0.1),
                    0 1px 2px rgba(0,0,0,0.7),
                    0 0 0 1px rgba(255,255,255,0.08)
                  `,
                }}
              />
            </div>
          </div>
        </button>
      </div>

      <span className="font-stamp text-[9px] uppercase tracking-[0.15em] text-film-amber">
        {filter.name}
      </span>
    </div>
  );
}
