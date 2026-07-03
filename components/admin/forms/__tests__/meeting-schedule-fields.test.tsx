import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CapacityField,
  MeetingDayTimeFields,
  MeetingFrequencyParityFields,
} from "@/components/admin/forms/meeting-schedule-fields";

const createIdFor = (field: string) => `group-${field}`;
const editIdFor = (field: string) => `edit-${field}-g1`;

describe("MeetingDayTimeFields", () => {
  it("renders day/time controls with the caller's id scheme and defaults", () => {
    const html = renderToStaticMarkup(
      <MeetingDayTimeFields
        idFor={editIdFor}
        dayDefault="Wednesday"
        timeDefault="19:00"
      />
    );

    expect(html).toContain('id="edit-meeting_day-g1"');
    expect(html).toContain('name="meeting_day"');
    expect(html).toContain('id="edit-meeting_time-g1"');
    expect(html).toContain('name="meeting_time"');
    expect(html).toContain('value="19:00"');
    expect(html).not.toContain("(optional)");
  });

  it("suffixes labels with (optional) for the create form", () => {
    const html = renderToStaticMarkup(
      <MeetingDayTimeFields
        idFor={createIdFor}
        optionalLabels
        dayDefault=""
        timeDefault=""
      />
    );

    expect(html).toContain("Meeting day (optional)");
    expect(html).toContain("Meeting time (optional)");
    expect(html).toContain('id="group-meeting_day"');
  });
});

describe("MeetingFrequencyParityFields", () => {
  it("renders the parity select and hint only when biweekly", () => {
    const biweekly = renderToStaticMarkup(
      <MeetingFrequencyParityFields
        idFor={createIdFor}
        frequency="biweekly"
        onFrequencyChange={() => {}}
        parityDefault="odd"
      />
    );

    expect(biweekly).toContain('name="meeting_week_parity"');
    expect(biweekly).toContain('id="group-meeting_week_parity"');
    expect(biweekly).toContain("Which weeks does it meet?");
    expect(biweekly).toContain("For groups that meet every other week.");

    const weekly = renderToStaticMarkup(
      <MeetingFrequencyParityFields
        idFor={createIdFor}
        frequency="weekly"
        onFrequencyChange={() => {}}
        parityDefault=""
      />
    );

    expect(weekly).toContain('name="meeting_frequency"');
    expect(weekly).not.toContain('name="meeting_week_parity"');
  });
});

describe("CapacityField", () => {
  it("renders a range-checked number control when asNumber", () => {
    const html = renderToStaticMarkup(
      <CapacityField
        id="edit-capacity-g1"
        label="Capacity"
        asNumber
        defaultValue={12}
        placeholder="12"
      />
    );

    expect(html).toContain('type="number"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="1000"');
    expect(html).toContain('name="capacity"');
  });

  it("falls back to a plain text control when collapsed (asNumber=false)", () => {
    const html = renderToStaticMarkup(
      <CapacityField
        id="group-capacity"
        label="Capacity (optional)"
        asNumber={false}
        defaultValue=""
        placeholder="Unknown"
        hint="No ministry default set."
      />
    );

    expect(html).toContain('type="text"');
    expect(html).not.toContain('min="0"');
    expect(html).not.toContain('max="1000"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain("No ministry default set.");
  });
});
