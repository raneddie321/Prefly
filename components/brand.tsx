import { useId } from "react";

export function LogoMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-a`} x1="6" y1="4" x2="30" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.55" stopColor="#6d5dfc" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="10" y1="22" x2="16" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path d="M9 9.5A5.5 5.5 0 0 1 14.5 4h7.5a11 11 0 0 1 0 22h-4v-8h4a3 3 0 0 0 0-6h-5v20.5a4 4 0 0 1-8 0z" fill={`url(#${id}-a)`} />
      <path d="M9 22h8v10.5a4 4 0 0 1-8 0z" fill={`url(#${id}-b)`} opacity="0.95" />
    </svg>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5" dir="ltr">
      <LogoMark size={size} />
      <span className="text-[1.6rem] font-extrabold tracking-tight text-ink">Prefly</span>
    </span>
  );
}

/** The floating Prefly robot from the home page. */
export function Mascot({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 320 320" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-body`} cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f2efff" />
          <stop offset="1" stopColor="#d9d2ff" />
        </radialGradient>
        <linearGradient id={`${id}-visor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2550" />
          <stop offset="1" stopColor="#0c0a1f" />
        </linearGradient>
        <linearGradient id={`${id}-ear`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6d5dfc" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#6d5dfc" floodOpacity="0.22" />
        </filter>
      </defs>
      <g filter={`url(#${id}-shadow)`}>
        {/* body */}
        <path d="M118 226c0-24 18-40 42-40s42 16 42 40v18c0 18-19 30-42 30s-42-12-42-30z" fill={`url(#${id}-body)`} />
        <path d="M150 210c10-6 22-2 24 8 2 9-6 16-14 15" stroke="#8b5cf6" strokeWidth="9" strokeLinecap="round" fill="none" />
        <path d="M150 210v32" stroke="#8b5cf6" strokeWidth="9" strokeLinecap="round" />
        {/* arms */}
        <ellipse cx="108" cy="232" rx="13" ry="22" transform="rotate(25 108 232)" fill={`url(#${id}-body)`} />
        <ellipse cx="214" cy="226" rx="13" ry="22" transform="rotate(-35 214 226)" fill={`url(#${id}-body)`} />
        {/* legs */}
        <ellipse cx="142" cy="276" rx="15" ry="12" fill="#e7e2ff" />
        <ellipse cx="180" cy="276" rx="15" ry="12" fill="#e7e2ff" />
        {/* head */}
        <rect x="60" y="48" width="200" height="150" rx="72" fill={`url(#${id}-body)`} />
        <rect x="44" y="96" width="30" height="62" rx="15" fill={`url(#${id}-ear)`} />
        <rect x="246" y="96" width="30" height="62" rx="15" fill={`url(#${id}-ear)`} />
        <ellipse cx="261" cy="127" rx="9" ry="20" fill="#c4b5fd" opacity="0.7" />
        <rect x="84" y="78" width="152" height="96" rx="46" fill={`url(#${id}-visor)`} />
        <path d="M104 96c18-10 50-12 72-8" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="6" strokeLinecap="round" fill="none" />
        {/* happy eyes */}
        <g filter={`url(#${id}-glow)`} stroke="#a5b4fc" strokeWidth="11" strokeLinecap="round" fill="none">
          <path d="M120 136c4-14 22-14 26 0" />
          <path d="M174 136c4-14 22-14 26 0" />
        </g>
        <g stroke="#eef2ff" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M120 136c4-14 22-14 26 0" />
          <path d="M174 136c4-14 22-14 26 0" />
        </g>
        <ellipse cx="160" cy="191" rx="14" ry="3" fill="#a78bfa" opacity="0.5" />
      </g>
    </svg>
  );
}

/** Square cover used on game cards: palette gradient plus the game's emoji. */
export function GameCover({ emoji, palette, className = "", hideEmoji = false }: { emoji: string; palette: string[]; className?: string; hideEmoji?: boolean }) {
  const [a, b, c] = [palette[0] ?? "#6d5dfc", palette[1] ?? "#a78bfa", palette[2] ?? palette[0] ?? "#6d5dfc"];
  const position = /\babsolute\b/.test(className) ? "" : "relative";
  return (
    <div
      className={`${position} flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `radial-gradient(circle at 30% 20%, ${b}, transparent 60%), linear-gradient(135deg, ${a}, ${c})` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.25),transparent_45%)]" />
      {!hideEmoji && <span className="relative text-5xl drop-shadow-[0_6px_12px_rgba(0,0,0,0.25)]">{emoji}</span>}
    </div>
  );
}
