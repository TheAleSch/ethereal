// parseGradient must accept the omitted-prelude forms CSS allows —
// `radial-gradient(red, blue)` has no shape/position segment, so the first
// top-level segment is already the first color stop. The parser used to
// unconditionally consume parts[0] as a prelude for radial/conic, silently
// dropping the first stop. These tests pin the fix: default-prelude and
// explicit-prelude variants both keep every stop, and parse → format → parse
// round-trips are stable.
import { describe, expect, it } from "vitest";

import { parseColor } from "./color";
import { formatGradient, parseGradient } from "./gradient";
import type { Gradient, GradientStop } from "./gradient";
import type { OklchColor } from "./types";

const RED = parseColor("red") as OklchColor;
const BLUE = parseColor("blue") as OklchColor;

function expectColorClose(actual: OklchColor, expected: OklchColor): void {
  expect(actual.l).toBeCloseTo(expected.l, 3);
  expect(actual.c).toBeCloseTo(expected.c, 3);
  expect(actual.h).toBeCloseTo(expected.h, 2);
  expect(actual.alpha).toBeCloseTo(expected.alpha, 3);
}

function expectStopsClose(
  actual: GradientStop[],
  expected: Array<{ color: OklchColor; position: number }>,
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((stop, index) => {
    expectColorClose(stop.color, expected[index].color);
    expect(stop.position).toBeCloseTo(expected[index].position, 4);
  });
}

/** parse → format → parse: the second parse must match the first. */
function expectRoundTrip(gradient: Gradient): void {
  const reparsed = parseGradient(formatGradient(gradient));
  expect(reparsed).not.toBeNull();
  const second = reparsed as Gradient;
  expect(second.type).toBe(gradient.type);
  expect(second.repeating ?? false).toBe(gradient.repeating ?? false);
  expect(second.interp).toBe(gradient.interp);
  expectStopsClose(second.stops, gradient.stops);
  if (gradient.type === "radial" && second.type === "radial") {
    expect(second.shape).toBe(gradient.shape);
    expect(second.size).toBe(gradient.size);
    expect(second.center.x).toBeCloseTo(gradient.center.x, 4);
    expect(second.center.y).toBeCloseTo(gradient.center.y, 4);
  }
  if (gradient.type === "conic" && second.type === "conic") {
    expect(second.startAngle).toBeCloseTo(gradient.startAngle, 4);
    expect(second.center.x).toBeCloseTo(gradient.center.x, 4);
    expect(second.center.y).toBeCloseTo(gradient.center.y, 4);
  }
}

describe("parseGradient radial without a prelude", () => {
  it("keeps both stops of radial-gradient(red, blue)", () => {
    const gradient = parseGradient("radial-gradient(red, blue)");
    expect(gradient).not.toBeNull();
    expect(gradient?.type).toBe("radial");
    if (gradient?.type !== "radial") return;
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 1 },
    ]);
    // Prelude omitted entirely — everything defaults.
    expect(gradient.shape).toBe("ellipse");
    expect(gradient.size).toBe("farthest-corner");
    expect(gradient.center).toEqual({ x: 0.5, y: 0.5 });
    expect(gradient.interp).toBe("oklch");
    expectRoundTrip(gradient);
  });

  it("keeps explicit positions on a preludeless first stop", () => {
    const gradient = parseGradient("radial-gradient(red 20%, blue 80%)");
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "radial") return;
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0.2 },
      { color: BLUE, position: 0.8 },
    ]);
    expectRoundTrip(gradient);
  });

  it("keeps both stops of repeating-radial-gradient(red 0%, blue 100%)", () => {
    const gradient = parseGradient(
      "repeating-radial-gradient(red 0%, blue 100%)",
    );
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "radial") return;
    expect(gradient.repeating).toBe(true);
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 1 },
    ]);
    expectRoundTrip(gradient);
  });
});

describe("parseGradient radial with an explicit prelude", () => {
  it("parses radial-gradient(circle at 30% 30%, red, blue)", () => {
    const gradient = parseGradient(
      "radial-gradient(circle at 30% 30%, red, blue)",
    );
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "radial") return;
    expect(gradient.shape).toBe("circle");
    expect(gradient.center.x).toBeCloseTo(0.3, 4);
    expect(gradient.center.y).toBeCloseTo(0.3, 4);
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 1 },
    ]);
    expectRoundTrip(gradient);
  });

  it("parses repeating-radial-gradient(circle closest-side, red, blue 40%)", () => {
    const gradient = parseGradient(
      "repeating-radial-gradient(circle closest-side, red, blue 40%)",
    );
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "radial") return;
    expect(gradient.repeating).toBe(true);
    expect(gradient.shape).toBe("circle");
    expect(gradient.size).toBe("closest-side");
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 0.4 },
    ]);
    expectRoundTrip(gradient);
  });

  it("still consumes a formatGradient prelude with interp", () => {
    const gradient = parseGradient(
      "radial-gradient(circle farthest-side at 25% 75% in oklab, red, blue)",
    );
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "radial") return;
    expect(gradient.shape).toBe("circle");
    expect(gradient.size).toBe("farthest-side");
    expect(gradient.interp).toBe("oklab");
    expect(gradient.center.x).toBeCloseTo(0.25, 4);
    expect(gradient.center.y).toBeCloseTo(0.75, 4);
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 1 },
    ]);
    expectRoundTrip(gradient);
  });
});

describe("parseGradient conic without a prelude", () => {
  it("keeps both stops of conic-gradient(red, blue)", () => {
    const gradient = parseGradient("conic-gradient(red, blue)");
    expect(gradient).not.toBeNull();
    expect(gradient?.type).toBe("conic");
    if (gradient?.type !== "conic") return;
    expect(gradient.startAngle).toBe(0);
    expect(gradient.center).toEqual({ x: 0.5, y: 0.5 });
    expect(gradient.interp).toBe("oklch");
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 1 },
    ]);
    expectRoundTrip(gradient);
  });

  it("keeps both stops of repeating-conic-gradient(red 0%, blue 50%)", () => {
    const gradient = parseGradient(
      "repeating-conic-gradient(red 0%, blue 50%)",
    );
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "conic") return;
    expect(gradient.repeating).toBe(true);
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 0.5 },
    ]);
    expectRoundTrip(gradient);
  });
});

describe("parseGradient conic with an explicit prelude", () => {
  it("parses conic-gradient(from 45deg at 25% 75%, red, blue)", () => {
    const gradient = parseGradient(
      "conic-gradient(from 45deg at 25% 75%, red, blue)",
    );
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "conic") return;
    expect(gradient.startAngle).toBe(45);
    expect(gradient.center.x).toBeCloseTo(0.25, 4);
    expect(gradient.center.y).toBeCloseTo(0.75, 4);
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 1 },
    ]);
    expectRoundTrip(gradient);
  });

  it("still consumes a formatGradient prelude with interp", () => {
    const gradient = parseGradient(
      "conic-gradient(from 180deg at 50% 50% in hsl longer hue, red 10%, blue 90%)",
    );
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "conic") return;
    expect(gradient.startAngle).toBe(180);
    expect(gradient.interp).toBe("hsl-longer");
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0.1 },
      { color: BLUE, position: 0.9 },
    ]);
    expectRoundTrip(gradient);
  });
});

describe("parseGradient linear (regression guard)", () => {
  it("still keeps both stops of linear-gradient(red, blue)", () => {
    const gradient = parseGradient("linear-gradient(red, blue)");
    expect(gradient).not.toBeNull();
    if (gradient?.type !== "linear") return;
    expect(gradient.angle).toBe(180);
    expectStopsClose(gradient.stops, [
      { color: RED, position: 0 },
      { color: BLUE, position: 1 },
    ]);
    expectRoundTrip(gradient);
  });
});
