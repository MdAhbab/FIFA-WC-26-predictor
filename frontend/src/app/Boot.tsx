import { useEffect, useState } from "react";
import App from "./App";
import { bootstrap } from "./lib/data";
import { VotesProvider } from "./lib/VotesContext";
import type { VoteSummary } from "./lib/types";

type Status = "loading" | "ready" | "error";

export default function Boot() {
  const [status, setStatus] = useState<Status>("loading");
  const [votes, setVotes] = useState<VoteSummary | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    bootstrap()
      .then((d) => {
        if (!alive) return;
        setVotes(d.votes);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [tries]);

  if (status === "loading") return <Splash subtitle="Warming up the model..." />;
  if (status === "error")
    return (
      <Splash
        subtitle="Could not reach the prediction server."
        action={
          <button
            type="button"
            onClick={() => setTries((t) => t + 1)}
            className="mt-4 rounded-md border-2 border-foreground px-4 py-2 text-sm uppercase tracking-wider hover:bg-muted"
          >
            Retry
          </button>
        }
      />
    );

  return (
    <VotesProvider initial={votes}>
      <App />
    </VotesProvider>
  );
}

function Splash({
  subtitle,
  action,
}: {
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-2 px-6 text-center">
      <div className="display text-4xl sm:text-5xl tracking-tight">
        WORLD CUP '26 PREDICTOR
      </div>
      <div className="text-muted-foreground text-sm">{subtitle}</div>
      <div className="mt-4 flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-2 rounded-full bg-foreground/60 animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      {action}
    </div>
  );
}
