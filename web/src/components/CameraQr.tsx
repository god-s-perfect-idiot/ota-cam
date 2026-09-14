type Props = {
  src: string;
  label: string;
  code: string;
};

/**
 * QR code framed as a miniature disposable camera — leather body, metal
 * viewfinder bezel, flash bump, and film-counter stamp. The QR stays
 * high-contrast and unobstructed so scanners still read it.
 */
export function CameraQr({ src, label, code }: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="texture-leather relative w-[14.5rem] rounded-[1.15rem] border border-white/10 px-3 pb-3 pt-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.45)]">
        {/* Top deck: flash + brand + optical viewfinder */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="texture-metal h-5 w-9 rounded-sm border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <div className="mx-auto mt-[5px] h-[6px] w-5 rounded-[1px] bg-film-cream/85 shadow-[0_0_6px_rgba(246,234,214,0.35)]" />
          </div>
          <p className="font-stamp text-[9px] uppercase tracking-[0.28em] text-film-amber/90">
            ota-cam
          </p>
          <div className="texture-metal flex h-5 w-8 items-center justify-center gap-[3px] rounded-sm border border-white/10">
            <div className="h-2.5 w-3 rounded-[1px] border border-film-cream/20 bg-film-black/80" />
            <div className="h-2 w-2 rounded-full border border-film-cream/15 bg-film-black/60" />
          </div>
        </div>

        {/* Viewfinder housing + shutter */}
        <div className="flex items-end gap-2.5">
          <div className="texture-metal relative min-w-0 flex-1 rounded-lg p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_10px_rgba(0,0,0,0.4)]">
            <div className="relative overflow-hidden rounded-[5px] bg-[#0a0806] p-1.5 shadow-[inset_0_3px_10px_rgba(0,0,0,0.8)]">
              <img
                src={src}
                alt={`QR code linking to ${label}`}
                className="block w-full rounded-sm"
                width={320}
                height={320}
              />
              {/* Viewfinder chrome over the quiet margin only */}
              <div className="pointer-events-none absolute inset-2">
                <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-film-cream/35" />
                <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-film-cream/35" />
                <span className="absolute bottom-0 left-0 h-3 w-3 border-b border-l border-film-cream/35" />
                <span className="absolute bottom-0 right-0 h-3 w-3 border-b border-r border-film-cream/35" />
              </div>
            </div>
          </div>

          <div className="mb-1 flex shrink-0 flex-col items-center gap-1">
            <div className="texture-brushed-steel h-8 w-8 rounded-full border border-white/15 shadow-[0_2px_6px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]">
              <div className="m-[5px] h-[1.375rem] w-[1.375rem] rounded-full bg-gradient-to-b from-[#3a3a3a] to-[#1a1a1a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.12)]" />
            </div>
            <span className="font-stamp text-[7px] uppercase tracking-[0.18em] text-film-cream/35">
              shoot
            </span>
          </div>
        </div>

        {/* Film window */}
        <div className="mt-2.5 flex items-center justify-between px-0.5">
          <span className="font-stamp text-[8px] uppercase tracking-[0.2em] text-film-cream/35">
            scan to shoot
          </span>
          <span className="rounded-sm border border-film-amber/25 bg-black/35 px-1.5 py-0.5 font-stamp text-[10px] tracking-wider text-film-amber">
            {code}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-film-cream/45">Guests scan this to start shooting</p>
    </div>
  );
}
