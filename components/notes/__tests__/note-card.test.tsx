import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NoteCard,
  NoteList,
  PrayerStatusChip,
  noteBodyClassName,
} from "../note-card";

// The shared Care Note surface kit (ADR 0036): one card + labeled-list module
// that the three oversight-ladder tiers configure with copy. These tests pin
// the idiom the tiers used to hand-copy.

describe("NoteCard", () => {
  it("renders the body with the shared note-body styling and a Recorded line", () => {
    const html = renderToStaticMarkup(
      <NoteCard body="Checked in after church." recordedAtIso="2026-06-01" />
    );
    expect(html).toContain("Checked in after church.");
    expect(html).toContain(noteBodyClassName);
    expect(html).toContain("Recorded");
    expect(html).toContain("2026");
  });

  it("prefixes the meta line with the context when given", () => {
    const html = renderToStaticMarkup(
      <NoteCard
        body="Group note"
        recordedAtIso="2026-06-01"
        context="Alpha Group"
      />
    );
    expect(html).toContain("Alpha Group");
  });

  it("shows a status chip only for a non-open prayer status", () => {
    const answered = renderToStaticMarkup(
      <NoteCard
        body="Prayer"
        recordedAtIso="2026-06-01"
        prayerStatus="answered"
      />
    );
    expect(answered).toContain("Answered");

    const open = renderToStaticMarkup(
      <NoteCard body="Prayer" recordedAtIso="2026-06-01" prayerStatus="open" />
    );
    expect(open).not.toContain("Answered");
    expect(open).not.toContain("Archived");
  });
});

describe("PrayerStatusChip", () => {
  it("renders nothing for open — open is the default, not a signal", () => {
    expect(renderToStaticMarkup(<PrayerStatusChip status="open" />)).toBe("");
  });

  it("labels answered and archived on the shared Badge vocabulary", () => {
    expect(
      renderToStaticMarkup(<PrayerStatusChip status="answered" />)
    ).toContain("Answered");
    expect(
      renderToStaticMarkup(<PrayerStatusChip status="archived" />)
    ).toContain("Archived");
  });
});

describe("NoteList", () => {
  it("renders the count in the label and the empty text for no items", () => {
    const html = renderToStaticMarkup(
      <NoteList label="Care notes" emptyText="No care notes yet." items={[]} />
    );
    expect(html).toContain("Care notes (0)");
    expect(html).toContain("No care notes yet.");
    expect(html).not.toContain("<ul");
  });

  it("renders one card per item instead of the empty text", () => {
    const html = renderToStaticMarkup(
      <NoteList
        label="Prayer requests"
        emptyText="No prayer requests yet."
        items={[
          { id: "p1", body: "First", recordedAtIso: "2026-06-01" },
          {
            id: "p2",
            body: "Second",
            recordedAtIso: "2026-06-02",
            prayerStatus: "answered",
          },
        ]}
      />
    );
    expect(html).toContain("Prayer requests (2)");
    expect(html).toContain("First");
    expect(html).toContain("Second");
    expect(html).toContain("Answered");
    expect(html).not.toContain("No prayer requests yet.");
  });
});
