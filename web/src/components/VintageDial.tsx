interface Props {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Click-to-toggle rotary dial styled like a vintage camera control knob.
 */
export function VintageDial({ label, active, onClick, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={`${label}: ${active ? 'on' : 'off'}`}
      className="group flex flex-col items-center gap-1.5 disabled:opacity-40"
    >
      <div className="relative">
        {/* Dial base plate */}
        <div className="texture-metal h-[52px] w-[52px] rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_2px_6px_rgba(0,0,0,0.5)]">
          {/* Tick marks */}
          <div className="absolute inset-0 rounded-full">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <span
                key={deg}
                className="absolute left-1/2 top-[3px] h-[5px] w-[1px] -translate-x-1/2 bg-film-cream/25"
                style={{ transform: `translateX(-50%) rotate(${deg}deg)`, transformOrigin: '50% 23px' }}
              />
            ))}
          </div>

          {/* Rotating knob */}
          <div
            className="absolute inset-[6px] rounded-full bg-gradient-to-b from-[#3a3530] to-[#1a1612] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_3px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out group-active:scale-95"
            style={{ transform: `rotate(${active ? 45 : 0}deg)` }}
          >
            {/* Knurling ridges */}
            <div className="absolute inset-0 rounded-full opacity-30">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute left-1/2 top-[2px] h-[3px] w-[1px] -translate-x-1/2 bg-film-cream/40"
                  style={{ transform: `translateX(-50%) rotate(${i * 15}deg)`, transformOrigin: '50% 18px' }}
                />
              ))}
            </div>

            {/* Pointer notch */}
            <div className="absolute left-1/2 top-[4px] h-[6px] w-[2px] -translate-x-1/2 rounded-full bg-film-amber shadow-[0_0_4px_rgba(255,176,32,0.5)]" />
          </div>
        </div>

        {/* ON/OFF labels */}
        <span className="absolute -left-1 top-1/2 -translate-y-1/2 font-stamp text-[7px] uppercase tracking-wider text-film-cream/30">
          off
        </span>
        <span className="absolute -right-0.5 top-[6px] font-stamp text-[7px] uppercase tracking-wider text-film-cream/30">
          on
        </span>
      </div>

      <span
        className={`font-stamp text-[9px] uppercase tracking-[0.15em] transition-colors ${
          active ? 'text-film-amber' : 'text-film-cream/40'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
