import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ConfirmPhraseInput,
  confirmPhraseMatches,
} from "@/components/admin/forms/confirm-phrase-input";

describe("confirmPhraseMatches", () => {
  it("matches the exact phrase, tolerating surrounding whitespace", () => {
    expect(confirmPhraseMatches("CLEAR HISTORY", "CLEAR HISTORY")).toBe(true);
    expect(confirmPhraseMatches("  CLEAR HISTORY  ", "CLEAR HISTORY")).toBe(
      true
    );
    expect(confirmPhraseMatches("clear history", "CLEAR HISTORY")).toBe(false);
    expect(confirmPhraseMatches("", "CLEAR HISTORY")).toBe(false);
  });
});

describe("ConfirmPhraseInput", () => {
  it("renders a labeled field wired to its input id", () => {
    const html = renderToStaticMarkup(
      <ConfirmPhraseInput
        id="wipe-confirm"
        phrase="CLEAR HISTORY"
        label={<>Type CLEAR HISTORY to confirm</>}
        value=""
        onChange={() => {}}
      />
    );

    expect(html).toContain('for="wipe-confirm"');
    expect(html).toContain('id="wipe-confirm"');
    expect(html).toContain("Type CLEAR HISTORY to confirm");
    expect(html).toContain('placeholder="CLEAR HISTORY"');
    expect(html).toContain('name="confirm"');
    expect(html).not.toContain("aria-label");
    expect(html).not.toContain("max-w-[220px]");
  });

  it("renders bare with an aria-label and bounded width for inline placement", () => {
    const html = renderToStaticMarkup(
      <ConfirmPhraseInput
        phrase="RESTORE"
        ariaLabel="Type RESTORE to confirm restoring Wednesday Westside"
        name="entity-restore-confirm"
        bounded
        value=""
        onChange={() => {}}
      />
    );

    expect(html).not.toContain("<label");
    expect(html).toContain(
      'aria-label="Type RESTORE to confirm restoring Wednesday Westside"'
    );
    expect(html).toContain('name="entity-restore-confirm"');
    expect(html).toContain("max-w-[220px]");
  });
});
