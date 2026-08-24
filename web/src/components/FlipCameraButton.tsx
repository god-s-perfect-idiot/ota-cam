interface Props {
  onClick: () => void;
}

/**
 * Small side-mounted lever styled like a vintage camera's self-timer / mode switch.
 */
export function FlipCameraButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Switch camera"
      className="group flex flex-col items-center gap-1.5"
    >
      <div className="relative h-[52px] w-[36px]">
        {/* Lever housing */}
        <div className="texture-metal absolute inset-x-0 bottom-0 top-2 rounded-md shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_1px_3px_rgba(0,0,0,0.4)]" />

        {/* Lever arm */}
        <div className="absolute left-1/2 top-0 h-[28px] w-[14px] -translate-x-1/2 rounded-sm bg-gradient-to-b from-[#4a4540] to-[#2a2520] shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-transform group-active:translate-y-[3px] group-active:shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
          {/* Knurl grip */}
          <div className="absolute inset-x-[3px] top-[6px] space-y-[2px]">
            <div className="h-[1px] bg-film-cream/15" />
            <div className="h-[1px] bg-film-cream/15" />
            <div className="h-[1px] bg-film-cream/15" />
          </div>
        </div>
      </div>

      <span className="font-stamp text-[9px] uppercase tracking-[0.15em] text-film-cream/40">
        flip
      </span>
    </button>
  );
}
