import { describe, expect, it } from "vitest";
import { withRollingAverage } from "../src/shared/rolling";

const sundays = (values: number[], start = "2026-08-02") =>
  values.map((value, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return { date: d.toISOString().slice(0, 10), value };
  });

describe("withRollingAverage", () => {
  it("averages the last four Sundays, using what's available at the start", () => {
    const out = withRollingAverage(sundays([100, 80, 90, 110, 120]));
    expect(out.map((p) => p.rollingAverage)).toEqual([100, 90, 90, 95, 100]);
    expect(out.map((p) => p.windowCount)).toEqual([1, 2, 3, 4, 4]);
  });

  it("uses a calendar window, so a skipped week isn't filled from further back", () => {
    const points = [
      { date: "2026-09-06", value: 100 },
      // 2026-09-13 skipped
      { date: "2026-09-20", value: 60 },
      { date: "2026-09-27", value: 80 },
      { date: "2026-10-04", value: 90 },
    ];
    const last = withRollingAverage(points).at(-1)!;
    // Window is Sep 7 – Oct 4: the Sep 6 report is out, leaving three Sundays.
    expect(last).toMatchObject({ windowCount: 3, rollingAverage: 77 });
  });

  it("sorts unordered input and handles an empty list", () => {
    expect(withRollingAverage([])).toEqual([]);
    const out = withRollingAverage([...sundays([10, 20])].reverse());
    expect(out.map((p) => p.date)).toEqual(["2026-08-02", "2026-08-09"]);
    expect(out[1]!.rollingAverage).toBe(15);
  });
});
