import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildSeed } from './seed';
import type { AppState, Role } from './types';

const KEY = 'roster-command-center:v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    /* storage unavailable — fall back to seed */
  }
  return buildSeed();
}

interface Store {
  state: AppState;
  /** Apply a mutation to a draft copy of state. */
  update: (fn: (draft: AppState) => void) => void;
  replace: (s: AppState) => void;
  reset: () => void;
  can: (...roles: Role[]) => boolean;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const store = useMemo<Store>(
    () => ({
      state,
      update: (fn) =>
        setState((prev) => {
          const draft = structuredClone(prev);
          fn(draft);
          return draft;
        }),
      replace: (s) => setState(s),
      reset: () => setState(buildSeed()),
      can: (...roles) => roles.includes(state.role),
    }),
    [state],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
export const today = () => new Date().toISOString().slice(0, 10);
