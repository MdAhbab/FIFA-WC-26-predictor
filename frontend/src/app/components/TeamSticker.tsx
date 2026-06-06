import type { RawTeam } from "../lib/types";

interface Props {
  team: RawTeam;
  selected?: boolean;
  dim?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  badge?: string;
  rotation?: number;
}

const SIZE: Record<NonNullable<Props["size"]>, { box: string; flag: number; pad: string; name: string }> = {
  sm: { box: "w-full max-w-[150px]", flag: 28, pad: "px-2 py-2", name: "text-sm" },
  md: { box: "w-full max-w-[180px]", flag: 40, pad: "px-3 py-3", name: "text-base" },
  lg: { box: "w-full max-w-[220px]", flag: 56, pad: "px-4 py-4", name: "text-lg" },
};

const VALID_FLAG_W = [20, 40, 80, 160, 320, 640];
function snapFlagW(target: number) {
  return VALID_FLAG_W.find((w) => w >= target) ?? 320;
}

export function TeamSticker({
  team,
  selected,
  dim,
  size = "md",
  onClick,
  badge,
  rotation = 0,
}: Props) {
  const s = SIZE[size];
  const w = snapFlagW(s.flag * 2);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ transform: `rotate(${rotation}deg)` }}
      className={`group relative ${s.box} ${s.pad} ${
        onClick ? "cursor-pointer" : "cursor-default"
      } rounded-[10px] border-2 transition-all duration-200 text-left ${
        selected
          ? "border-foreground bg-card shadow-[3px_3px_0_var(--foreground)]"
          : dim
          ? "border-border bg-card/40 opacity-50"
          : "border-border bg-card hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--foreground)]"
      }`}
    >
      {selected && (
        <span
          className="absolute -top-3 -right-2 text-[10px] display tracking-[0.18em] px-1.5 py-0.5 bg-[var(--stamp-red)] text-[var(--paper-cream)] rotate-[6deg]"
          style={{ borderRadius: 2 }}
        >
          PICKED
        </span>
      )}
      {badge && !selected && (
        <span className="absolute -top-2 -right-2 text-[9px] display tracking-[0.18em] px-1.5 py-0.5 bg-foreground text-background rotate-[-4deg] rounded-sm">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-3">
        {team.iso ? (
          <img
            src={`https://flagcdn.com/w${w}/${team.iso}.png`}
            alt=""
            width={s.flag}
            height={Math.round(s.flag * 0.7)}
            className="rounded-[2px] shadow-[0_0_0_1px_rgba(24,18,14,0.15)] object-cover shrink-0"
          />
        ) : null}
        <div className="min-w-0">
          <div className={`display leading-tight ${s.name} truncate`}>
            {team.name}
          </div>
          <div className="text-[10px] mono text-muted-foreground tracking-wider">
            ELO {team.elo}
          </div>
        </div>
      </div>
    </button>
  );
}
