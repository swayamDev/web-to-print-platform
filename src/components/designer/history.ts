import type { DesignDocument } from "@/domain/design/schema";

/**
 * Undo/redo history for the designer. Changes that share a `key` and arrive within
 * COALESCE_MS of each other (typing in one text field, scrubbing one number) merge into a
 * single undo step, so Undo removes a whole word rather than one letter.
 */
export type History = {
  past: DesignDocument[];
  present: DesignDocument;
  future: DesignDocument[];
  lastKey: string | null;
  lastAt: number;
};

export type HistoryAction =
  | { type: "commit"; doc: DesignDocument; key?: string; at: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; doc: DesignDocument };

export const HISTORY_LIMIT = 50;
export const COALESCE_MS = 1200;

export const initialHistory = (doc: DesignDocument): History => ({
  past: [],
  present: doc,
  future: [],
  lastKey: null,
  lastAt: 0,
});

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "commit": {
      if (action.doc === state.present) return state;
      const coalesce =
        action.key !== undefined &&
        action.key === state.lastKey &&
        action.at - state.lastAt < COALESCE_MS;
      return {
        past: coalesce ? state.past : [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.doc,
        future: [],
        lastKey: action.key ?? null,
        lastAt: action.at,
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      return previous
        ? {
            past: state.past.slice(0, -1),
            present: previous,
            future: [state.present, ...state.future],
            lastKey: null,
            lastAt: 0,
          }
        : state;
    }
    case "redo": {
      const next = state.future[0];
      return next
        ? {
            past: [...state.past, state.present],
            present: next,
            future: state.future.slice(1),
            lastKey: null,
            lastAt: 0,
          }
        : state;
    }
    case "reset":
      return initialHistory(action.doc);
  }
}
