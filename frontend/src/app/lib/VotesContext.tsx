import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { VoteSummary } from "./types";

interface Ctx {
  votes: VoteSummary | null;
  refresh: () => Promise<void>;
  submit: (
    team1: string,
    team2?: string,
    champion?: string,
    name?: string,
    referrer_vote_id?: number,
    payload?: unknown,
  ) => Promise<{ vote_id: number; name: string }>;
}

const VotesCtx = createContext<Ctx | null>(null);

export function VotesProvider({
  initial,
  children,
}: {
  initial: VoteSummary | null;
  children: ReactNode;
}) {
  const [votes, setVotes] = useState<VoteSummary | null>(initial);

  const refresh = useCallback(async () => {
    try {
      setVotes(await api.votes());
    } catch {
      /* keep last known */
    }
  }, []);

  const submit = useCallback(
    async (
      team1: string,
      team2?: string,
      champion?: string,
      name?: string,
      referrer_vote_id?: number,
      payload?: unknown,
    ) => {
      const res = await api.vote({ team1, team2, champion, name, referrer_vote_id, payload });
      setVotes(res.votes);
      return { vote_id: res.vote_id, name: res.name };
    },
    [],
  );

  return (
    <VotesCtx.Provider value={{ votes, refresh, submit }}>
      {children}
    </VotesCtx.Provider>
  );
}

export function useVotes() {
  const ctx = useContext(VotesCtx);
  if (!ctx) throw new Error("useVotes must be used inside VotesProvider");
  return ctx;
}
