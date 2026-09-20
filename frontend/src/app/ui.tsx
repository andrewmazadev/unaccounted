import type { ReactNode } from "react";

/** Small mono caption used for panel titles and field labels. */
export const label =
  "font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400";

export const primaryButton =
  "border border-zinc-100 bg-zinc-100 px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-zinc-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-400";

export const secondaryButton =
  "border border-zinc-600 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:border-zinc-300 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

export function ClassificationBanner() {
  return (
    <div className="border-b border-amber-900/60 bg-amber-950/30 py-1 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-amber-400">
      Classified / Restricted distribution
    </div>
  );
}

export function Panel({
  title,
  meta,
  ariaLabel,
  className = "",
  children,
}: {
  title: string;
  meta?: ReactNode;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={ariaLabel ?? title}
      className={`border border-zinc-800 bg-panel ${className}`}
    >
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-2.5">
        <h2 className={label}>{title}</h2>
        {meta}
      </div>
      {children}
    </section>
  );
}
