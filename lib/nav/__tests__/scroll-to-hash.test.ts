// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollToHashTarget } from "@/lib/nav/scroll-to-hash";

// A controllable requestAnimationFrame queue + clock so the poll loop can be
// driven deterministically: each flush() runs one frame, advancing time.
let frameQueue: Array<() => void>;
let now: number;
const FRAME_MS = 16;

function flushFrame() {
  const cbs = frameQueue;
  frameQueue = [];
  now += FRAME_MS;
  for (const cb of cbs) cb();
}

beforeEach(() => {
  frameQueue = [];
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frameQueue.push(() => cb(now));
    return frameQueue.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

function addTarget(id: string): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  const spy = vi.fn();
  el.scrollIntoView = spy;
  document.body.appendChild(el);
  return el;
}

describe("scrollToHashTarget", () => {
  it("scrolls to a target that already exists (on the first frame)", () => {
    const el = addTarget("seg-alpha");
    scrollToHashTarget("seg-alpha");
    flushFrame();
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(el.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto",
    });
  });

  it("keeps polling until a late-mounting target appears, then scrolls once", () => {
    scrollToHashTarget("seg-late");
    flushFrame(); // not present yet
    flushFrame(); // still not present
    const el = addTarget("seg-late");
    flushFrame(); // now present
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    // No further scrolls once it has fired.
    flushFrame();
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("stops polling after the timeout without scrolling", () => {
    scrollToHashTarget("seg-never", { timeoutMs: 32 });
    flushFrame(); // t=16, retry scheduled
    flushFrame(); // t=32, deadline reached -> stop, no further frame
    const el = addTarget("seg-never");
    flushFrame(); // queue empty: nothing runs
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("cancel() halts polling so a later-appearing target is not scrolled", () => {
    const cancel = scrollToHashTarget("seg-cancel");
    flushFrame(); // not present
    cancel();
    const el = addTarget("seg-cancel");
    flushFrame();
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("is a no-op for an empty id", () => {
    const cancel = scrollToHashTarget("");
    flushFrame();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(cancel).toBeTypeOf("function");
  });
});
