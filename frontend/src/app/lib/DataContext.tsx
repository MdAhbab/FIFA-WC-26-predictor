import { createContext, useContext, type ReactNode } from "react";
import { PREDICTIONS } from "./data";
import type { Predictions } from "./types";

const DataContext = createContext<Predictions>(PREDICTIONS);

export function DataProvider({ children }: { children: ReactNode }) {
  return <DataContext.Provider value={PREDICTIONS}>{children}</DataContext.Provider>;
}

export function usePredictions(): Predictions {
  return useContext(DataContext);
}
