import Link from "next/link";
import { GameCover } from "./brand";

export function GameCard({
  href,
  title,
  description,
  emoji,
  palette,
  meta,
  badge,
  actions,
}: {
  href: string;
  title: string;
  description?: string;
  emoji: string;
  palette: string[];
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-float">
      <Link href={href} className="block">
        <GameCover emoji={emoji} palette={palette} className="aspect-[16/10] w-full transition duration-300 group-hover:scale-[1.02]" />
      </Link>
      {badge && <div className="absolute start-3 top-3">{badge}</div>}
      <div className="flex flex-1 items-start gap-2 p-4">
        <Link href={href} className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{title}</h3>
          {description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{description}</p>}
          {meta && <div className="mt-2 text-xs text-ink-muted">{meta}</div>}
        </Link>
        {actions}
      </div>
    </div>
  );
}
