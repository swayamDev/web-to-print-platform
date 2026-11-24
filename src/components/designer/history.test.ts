import { describe, expect, it } from "vitest";

import { blankDocument } from "@/domain/design/document";
import type { DesignDocument } from "@/domain/design/schema";

import { COALESCE_MS, historyReducer, initialHistory } from "./history";

const base = blankDocument({ trimW: 100, trimH: 60, bleed: 3, safeMargin: 3 });
const v = (n: number): DesignDocument => ({ ...base, background: { color: `#00000${n}` } });

describe("designer history", () => {
  it("undoes and redoes separate changes one at a time", () => {
    let h = initialHistory(v(0));
    h = historyReducer(h, { type: "commit", doc: v(1), at: 0 });
    h = historyReducer(h, { type: "commit", doc: v(2), at: 5000 });
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toEqual(v(1));
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toEqual(v(2));
  });

  it("merges rapid changes to the same field into one undo step", () => {
    let h = initialHistory(v(0));
    for (let i = 1; i <= 5; i++) {
      h = historyReducer(h, { type: "commit", doc: v(i), key: "text-1:text", at: i * 100 });
    }
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toEqual(v(0));
  });

  it("starts a new step after a pause or for a different field", () => {
    let h = initialHistory(v(0));
    h = historyReducer(h, { type: "commit", doc: v(1), key: "a", at: 0 });
    h = historyReducer(h, { type: "commit", doc: v(2), key: "a", at: COALESCE_MS + 1 });
    h = historyReducer(h, { type: "commit", doc: v(3), key: "b", at: COALESCE_MS + 2 });
    expect(h.past).toEqual([v(0), v(1), v(2)]);
  });

  it("a new change after undo discards the redo stack", () => {
    let h = initialHistory(v(0));
    h = historyReducer(h, { type: "commit", doc: v(1), at: 0 });
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "commit", doc: v(2), at: 10 });
    expect(h.future).toEqual([]);
    expect(h.present).toEqual(v(2));
  });
});
