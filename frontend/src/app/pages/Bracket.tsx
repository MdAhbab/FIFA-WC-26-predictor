import { usePredictions } from "../lib/DataContext";
import { useSEO } from "../lib/useSEO";
import { BracketTree } from "../components/BracketTree";
import { AdSlot } from "../components/AdSlot";

export default function Bracket() {
  const data = usePredictions();
  useSEO({
    title: "Knockout Bracket · WC26 Predictor",
    description:
      "Round of 32 to Final — full predicted knockout bracket for the 2026 FIFA World Cup.",
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Knockout stage
        </div>
        <h1
          className="mt-1 text-[clamp(2rem,4vw,3rem)] tracking-tight"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          Predicted bracket · R32 → Final
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Each match is weighted by round (×1 R32 → ×6 Final). Winners highlighted in
          pitch-green; coin-flip ties decided on penalties.
        </p>
      </header>

      <BracketTree
        matches={data.knockout}
        champion={{ team: data.meta.champion, iso: data.meta.champion_iso }}
      />

      <AdSlot variant="leaderboard" />
    </main>
  );
}
