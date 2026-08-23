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
      className="group relative flex h-20 w-20 items-center justify-center rounded-full transition disabled:opacity-40"
    >
      <span className="absolute inset-0 rounded-full border-[3px] border-film-cream/70" />
      <span
        className="absolute inset-[7px] rounded-full bg-gradient-to-b from-film-orange to-film-amber shadow-[inset_0_-3px_8px_rgba(0,0,0,0.35)] transition group-active:inset-[10px]"
      />
    </button>
  );
}
