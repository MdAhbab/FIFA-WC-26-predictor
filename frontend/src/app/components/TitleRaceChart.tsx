import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TitleRaceEntry } from "../lib/types";

interface Props {
  data: TitleRaceEntry[];
  topN?: number;
}

const COLORS = [
  "#2E6BFF",
  "#5A56FF",
  "#8A45F5",
  "#B83CD8",
  "#E5247A",
  "#F25E5E",
  "#F58C3C",
  "#FFC23C",
  "#19C37D",
  "#1FA0A0",
];

export function TitleRaceChart({ data, topN = 10 }: Props) {
  const top = data.slice(0, topN).map((d) => ({
    ...d,
    pct: +(d.champion * 100).toFixed(1),
    label: `${d.team}`,
  }));

  return (
    <div className="w-full h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={top}
          layout="vertical"
          margin={{ top: 8, right: 32, left: 8, bottom: 8 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            tickFormatter={(v) => `${v}%`}
            stroke="var(--muted-foreground)"
            fontSize={11}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke="var(--muted-foreground)"
            fontSize={12}
            width={120}
            tick={({ x, y, payload }) => {
              const entry = top.find((t) => t.label === payload.value);
              return (
                <g transform={`translate(${x - 10},${y})`}>
                  <foreignObject x={-110} y={-10} width={110} height={22}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        justifyContent: "flex-end",
                        fontSize: 12,
                        color: "var(--foreground)",
                      }}
                    >
                      <span style={{ whiteSpace: "nowrap" }}>{entry?.team}</span>
                      {entry?.iso && (
                        <img
                          src={`https://flagcdn.com/w40/${entry.iso}.png`}
                          width={18}
                          height={13}
                          alt=""
                          style={{ borderRadius: 2 }}
                        />
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v}%`, "Champion probability"]}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Bar dataKey="pct" radius={[0, 8, 8, 0]}>
            {top.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
