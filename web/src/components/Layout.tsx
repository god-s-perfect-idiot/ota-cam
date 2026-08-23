import type { ReactNode } from 'react';

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-film-black p-6">
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-film-amber/30 border-t-film-amber" />
      {label && <p className="text-sm text-film-cream/60">{label}</p>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-film-shell p-5 ${className}`}>
      {children}
    </div>
  );
}
