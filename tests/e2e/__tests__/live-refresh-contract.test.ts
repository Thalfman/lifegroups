import { describe, expect, it, vi } from "vitest";
import { assertLiveThenPersist } from "../live-refresh-contract";

describe("assertLiveThenPersist", () => {
  it("requires the live UI contract before reloading for persistence", async () => {
    const events: string[] = [];

    await assertLiveThenPersist({
      assertLive: async () => {
        events.push("live");
      },
      reload: async () => {
        events.push("reload");
      },
      assertPersisted: async () => {
        events.push("persisted");
      },
    });

    expect(events).toEqual(["live", "reload", "persisted"]);
  });

  it("does not reload to rescue a failed live UI assertion", async () => {
    const reload = vi.fn();
    const assertPersisted = vi.fn();

    await expect(
      assertLiveThenPersist({
        assertLive: async () => {
          throw new Error("live repaint missing");
        },
        reload,
        assertPersisted,
      })
    ).rejects.toThrow("live repaint missing");

    expect(reload).not.toHaveBeenCalled();
    expect(assertPersisted).not.toHaveBeenCalled();
  });

  it("surfaces persistence failures after the live contract passes", async () => {
    await expect(
      assertLiveThenPersist({
        assertLive: async () => undefined,
        reload: async () => undefined,
        assertPersisted: async () => {
          throw new Error("persisted state missing");
        },
      })
    ).rejects.toThrow("persisted state missing");
  });
});
