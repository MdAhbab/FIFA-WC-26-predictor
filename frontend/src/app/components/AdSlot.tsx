interface Props {
  variant?: "leaderboard" | "rectangle" | "in-article";
  label?: string;
  className?: string;
}

const SIZES: Record<NonNullable<Props["variant"]>, { w: number; h: number }> = {
  leaderboard: { w: 728, h: 90 },
  rectangle: { w: 300, h: 250 },
  "in-article": { w: 0, h: 160 },
};

export function AdSlot({
  variant = "in-article",
  label = "Advertisement",
  className = "",
}: Props) {
  const { w, h } = SIZES[variant];
  return (
    <div
      role="complementary"
      aria-label={label}
      className={`relative mx-auto my-8 ticket flex flex-col items-center justify-center bg-card text-xs text-muted-foreground border-2 border-dashed border-foreground/20 ${className}`}
      style={{
        width: w ? `min(100%, ${w}px)` : "100%",
        height: h,
      }}
    >
      <span className="absolute top-2 left-3 text-[9px] display tracking-[0.25em] uppercase opacity-60">
        Advertisement
      </span>
      <span className="opacity-50 mono uppercase tracking-wider">
        {label} · {w || "fluid"}×{h}
      </span>
    </div>
  );
}
