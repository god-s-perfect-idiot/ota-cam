interface Props {
  disabled: boolean;
  onPress: () => void;
}

export function ShutterButton({ disabled, onPress }: Props) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label="Take photo"
      className="group relative flex h-[88px] w-[88px] items-center justify-center transition disabled:opacity-40"
    >
      {/* Dark matte bezel */}
      <span
        className="absolute inset-0 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-2px_4px_rgba(0,0,0,0.7)]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 35% 28%, #3a3a3a 0%, #1a1a1a 42%, #0a0a0a 72%, #000 100%)',
        }}
      />

      {/* Bezel wear rings */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full opacity-30"
        style={{
          backgroundImage: `
            radial-gradient(circle at 50% 50%,
              transparent 72%,
              rgba(255,255,255,0.04) 75%,
              transparent 78%,
              transparent 84%,
              rgba(0,0,0,0.2) 87%,
              transparent 90%,
              transparent 94%,
              rgba(255,255,255,0.03) 96%,
              transparent 98%
            )
          `,
        }}
      />

      {/* Recess gap */}
      <span className="absolute inset-[7px] rounded-full bg-black shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]" />

      {/* Brushed steel plunger */}
      <span
        className="texture-brushed-steel absolute inset-[9px] overflow-hidden rounded-full transition-all duration-100 group-active:inset-[13px] group-active:brightness-90"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 4px rgba(0,0,0,0.45), inset 1px 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.4)',
        }}
      >
        {/* Scratches + scuffs */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full opacity-70"
          style={{
            backgroundImage: `
              linear-gradient(18deg, transparent 42%, rgba(255,255,255,0.22) 42.3%, rgba(255,255,255,0.05) 42.7%, transparent 43.2%),
              linear-gradient(18deg, transparent 58%, rgba(0,0,0,0.35) 58.2%, transparent 58.6%),
              linear-gradient(-32deg, transparent 28%, rgba(255,255,255,0.18) 28.2%, transparent 28.6%),
              linear-gradient(-32deg, transparent 61%, rgba(0,0,0,0.28) 61.15%, transparent 61.5%),
              linear-gradient(72deg, transparent 35%, rgba(255,255,255,0.14) 35.15%, transparent 35.5%),
              linear-gradient(72deg, transparent 70%, rgba(0,0,0,0.25) 70.2%, transparent 70.55%),
              linear-gradient(128deg, transparent 22%, rgba(255,255,255,0.12) 22.15%, transparent 22.45%),
              linear-gradient(128deg, transparent 79%, rgba(0,0,0,0.3) 79.2%, transparent 79.6%),
              linear-gradient(-8deg, transparent 48%, rgba(255,255,255,0.1) 48.1%, transparent 48.35%),
              linear-gradient(95deg, transparent 15%, rgba(0,0,0,0.2) 15.15%, transparent 15.4%),
              radial-gradient(ellipse 18% 8% at 68% 24%, rgba(255,255,255,0.2), transparent 70%),
              radial-gradient(ellipse 12% 6% at 30% 72%, rgba(0,0,0,0.25), transparent 70%)
            `,
          }}
        />
      </span>

      {/* Top-left specular glint */}
      <span
        className="pointer-events-none absolute inset-[9px] rounded-full opacity-90 transition-all duration-100 group-active:inset-[13px] group-active:opacity-60"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 28%, transparent 48%)',
        }}
      />

      {/* Soft rim catch-light */}
      <span
        className="pointer-events-none absolute inset-[9px] rounded-full transition-all duration-100 group-active:inset-[13px]"
        style={{
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      />
    </button>
  );
}
