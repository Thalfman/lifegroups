// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useValueChange } from "../use-value-change";

// useValueChange runs onChange during render the first time `value` differs by
// identity from the previous render — the render-time "adjust state when a prop
// changes" pattern. These tests pin the identity-based detection.

describe("useValueChange", () => {
  it("does not fire on the initial render (value equals its own initial previous)", () => {
    const onChange = vi.fn();
    renderHook(({ value }) => useValueChange(value, onChange), {
      initialProps: { value: { n: 1 } },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires once with (value, previous) when the value changes by identity", () => {
    const onChange = vi.fn();
    const first = { n: 1 };
    const second = { n: 2 };
    const { rerender } = renderHook(
      ({ value }) => useValueChange(value, onChange),
      { initialProps: { value: first } }
    );

    rerender({ value: second });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(second, first);
  });

  it("does not fire when re-rendered with the same identity", () => {
    const onChange = vi.fn();
    const value = { n: 1 };
    const { rerender } = renderHook(
      ({ value }) => useValueChange(value, onChange),
      { initialProps: { value } }
    );

    rerender({ value });
    rerender({ value });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("fires again on each subsequent distinct value", () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(
      ({ value }) => useValueChange(value, onChange),
      { initialProps: { value: 0 } }
    );

    rerender({ value: 1 });
    rerender({ value: 2 });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 1, 0);
    expect(onChange).toHaveBeenNthCalledWith(2, 2, 1);
  });
});
