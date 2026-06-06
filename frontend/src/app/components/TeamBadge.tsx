interface Props {
  name: string;
  iso?: string;
  size?: number;
  className?: string;
  hideName?: boolean;
  reverse?: boolean;
}

function widthFor(size: number) {
  const widths = [20, 40, 80, 160, 320];
  return widths.find((w) => w >= size * 1.5) ?? 160;
}

export function TeamBadge({
  name,
  iso,
  size = 24,
  className = "",
  hideName = false,
  reverse = false,
}: Props) {
  if (!name) return null;
  const w = widthFor(size);
  const h = Math.round(size * 0.75);
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  const flag = iso ? (
    <img
      src={`https://flagcdn.com/w${w}/${iso}.png`}
      alt=""
      width={size}
      height={h}
      loading="lazy"
      decoding="async"
      className="rounded-[2px] shadow-[0_0_0_1px_rgba(24,18,14,0.18)] object-cover shrink-0"
      style={{ width: size, height: h }}
    />
  ) : (
    <span
      aria-hidden
      className="rounded-[2px] bg-muted text-muted-foreground inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: h, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );

  return (
    <span
      className={`flex items-center gap-2 min-w-0 ${reverse ? "flex-row-reverse" : ""} ${className}`}
    >
      {flag}
      {!hideName && <span className="truncate min-w-0">{name}</span>}
    </span>
  );
}
