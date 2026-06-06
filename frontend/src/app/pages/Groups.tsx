import { usePredictions } from "../lib/DataContext";
import { useSEO } from "../lib/useSEO";
import { GroupTable } from "../components/GroupTable";
import { AdSlot } from "../components/AdSlot";

export default function Groups() {
  const data = usePredictions();
  useSEO({
    title: "Group Stage Predictions · WC26 Predictor",
    description:
      "All 12 group tables and 72 group-stage match predictions for the 2026 FIFA World Cup.",
  });

  const groupLetters = Object.keys(data.groups).sort();

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Group Stage
        </div>
        <h1
          className="mt-1 text-[clamp(2rem,4vw,3rem)] tracking-tight"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          Predicted tables · 12 groups
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Top two from each group plus the eight best third-placed teams advance to
          the Round of 32. Tap a group to reveal each of its six fixtures.
        </p>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groupLetters.map((g, i) => (
          <div key={g}>
            <GroupTable
              group={g}
              standings={data.groups[g]}
              matches={data.group_matches.filter((m) => m.group === g)}
            />
            {i === 5 && (
              <div className="md:col-span-2 lg:col-span-3">
                <AdSlot variant="leaderboard" />
              </div>
            )}
          </div>
        ))}
      </div>

      <AdSlot variant="rectangle" />
    </main>
  );
}
