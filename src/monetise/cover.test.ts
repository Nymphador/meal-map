import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the browser's localStorage (tests run without one).
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});

const { adCoverMinutesLeft, markAdWatched } = await import("./ads");

describe("one video covers regenerating for 15 minutes", () => {
  beforeEach(() => store.clear());

  it("asks for a video until one is watched", () => {
    expect(adCoverMinutesLeft()).toBe(0);
  });

  it("counts down from 15 minutes, then asks again", () => {
    const now = Date.now();
    markAdWatched();
    expect(adCoverMinutesLeft(now)).toBe(15);
    expect(adCoverMinutesLeft(now + 10 * 60_000 + 1)).toBe(5);
    expect(adCoverMinutesLeft(now + 15 * 60_000 + 1000)).toBe(0);
  });

  it("a clock moved back can't stretch the cover", () => {
    markAdWatched();
    expect(adCoverMinutesLeft(Date.now() - 3 * 3600_000)).toBe(15);
  });
});
