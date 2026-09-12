import type { Facing } from '../lib/useCamera.js';

interface Props {
  facing: Facing;
  onClick: () => void;
}

/**
 * Chrome rotary switch — counterpart to the shutter. Outer ring + thumb
 * plateau rotate together; the center cap stays put.
 */
export function FlipCameraButton({ facing, onClick }: Props) {
  const front = facing === 'user';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={front ? 'Switch to rear camera' : 'Switch to front camera'}
      className="group flex flex-col items-center gap-1.5"
    >
      <div className="relative h-[64px] w-[56px]">
        {/* Body well */}
        <span
          className="absolute inset-x-[2px] bottom-[2px] top-[10px] rounded-full"
          style={{
            background:
              'radial-gradient(circle at 50% 40%, #2a2a2a 0%, #0c0c0c 55%, #000 100%)',
            boxShadow:
              'inset 0 3px 6px rgba(0,0,0,0.85), inset 0 -1px 0 rgba(255,255,255,0.06)',
          }}
        />

        {/* Rotating ring + plateau */}
        <span
          className="absolute inset-x-[2px] bottom-[2px] top-[10px] transition-transform duration-300"
          style={{
            transform: `rotate(${front ? 48 : -36}deg)`,
            transitionTimingFunction: 'cubic-bezier(0.34, 1.35, 0.64, 1)',
          }}
        >
          {/* Brushed chrome ring (same family as shutter) */}
          <span
            className="texture-brushed-steel absolute inset-0 overflow-hidden rounded-full"
            style={{
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 3px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.5)',
            }}
          />
          <span
            className="pointer-events-none absolute inset-0 rounded-full opacity-70"
            style={{
              background:
                'linear-gradient(145deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.08) 28%, transparent 48%, rgba(0,0,0,0.25) 100%)',
            }}
          />

          {/* Finger plateau — short raised metal step on the rim */}
          <span
            className="absolute left-1/2 top-[-5px] h-[10px] w-[15px] -translate-x-1/2"
            style={{
              borderRadius: '4px 4px 2px 2px',
              backgroundImage: `
                linear-gradient(180deg,
                  #f2f2f2 0%,
                  #c8c8c8 28%,
                  #8a8a8a 62%,
                  #555 100%
                )
              `,
              boxShadow: `
                inset 0 1px 0 rgba(255,255,255,0.9),
                inset 0 -1px 1px rgba(0,0,0,0.35),
                0 1px 2px rgba(0,0,0,0.4)
              `,
            }}
          >
            <span
              className="absolute left-1/2 top-[3px] h-[1.5px] w-[8px] -translate-x-1/2 rounded-[1px]"
              style={{
                background: 'rgba(0,0,0,0.35)',
                boxShadow: '0 0.5px 0 rgba(255,255,255,0.35)',
              }}
            />
          </span>

          {/* Registration dimple */}
          <span
            className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, #3a3a3a 0%, #0a0a0a 70%)',
              boxShadow:
                'inset 0 1px 1px rgba(0,0,0,0.85), 0 0.5px 0 rgba(255,255,255,0.2)',
              transform: 'rotate(145deg) translateY(-18px)',
            }}
          />
        </span>

        {/* Fixed center well + cap */}
        <span
          className="absolute inset-x-[11px] bottom-[11px] top-[19px] rounded-full bg-[#0a0a0a]"
          style={{
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,0,0,0.45)',
          }}
        />
        <span
          className="texture-brushed-steel absolute inset-x-[13px] bottom-[13px] top-[21px] overflow-hidden rounded-full"
          style={{
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -2px 4px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.35)',
          }}
        />
        <span
          className="pointer-events-none absolute inset-x-[13px] bottom-[13px] top-[21px] rounded-full opacity-55"
          style={{
            background:
              'linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 32%, transparent 52%)',
          }}
        />
      </div>

      <span className="font-stamp text-[9px] uppercase tracking-[0.15em] text-film-cream/40">
        flip
      </span>
    </button>
  );
}
