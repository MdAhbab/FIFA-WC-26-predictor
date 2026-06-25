// Persisted vote identity. A user is locked out of re-voting for 12 hours (per IP), so we remember
// their vote id + display name in localStorage. That makes the post-vote state (referral link, "who
// played under me", everyone's top-4 picks) survive a browser refresh and the whole lock window —
// the user can always come back to their referral hub even though they can't vote again.
const KEY = "wc26-myvote-v1";

export interface MyVote {
  voteId: number;
  name: string;
}

export function saveMyVote(v: MyVote): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function loadMyVote(): MyVote | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.voteId === "number" && p.voteId > 0) {
      return { voteId: p.voteId, name: String(p.name ?? "") };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearMyVote(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
