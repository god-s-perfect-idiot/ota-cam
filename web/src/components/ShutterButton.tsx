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
      {/* Outer metal ring */}
      <span className="texture-metal absolute inset-0 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),0_3px_8px_rgba(0,0,0,0.6)]" />

      {/* Inner recess */}
      <span className="absolute inset-[5px] rounded-full bg-gradient-to-b from-[#0a0806] to-[#1a1612] shadow-[inset_0_3px_8px_rgba(0,0,0,0.8)]" />

      {/* Shutter plunger */}
      <span
        className="absolute inset-[10px] rounded-full bg-gradient-to-b from-[#ff8c42] via-film-orange to-[#c44a00] shadow-[inset_0_2px_0_rgba(255,255,255,0.25),inset_0_-4px_8px_rgba(0,0,0,0.4),0_2px_4px_rgba(0,0,0,0.5)] transition-all duration-100 group-active:inset-[14px] group-active:shadow-[inset_0_1px_0_rgba(255,255,255,0.15),inset_0_-2px_4px_rgba(0,0,0,0.5)]"
      />

      {/* Center highlight */}
      <span className="pointer-events-none absolute inset-[18px] rounded-full bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-60 transition-all group-active:inset-[22px]" />
    </button>
  );
}
