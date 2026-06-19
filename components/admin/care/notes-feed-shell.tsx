"use client";

import { memo, useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cardClassName, cardHeadingClassName } from "@/components/lg/Card";
import { NoteTransparencyToggle } from "@/components/admin/shepherd-care/note-transparency-toggle";
import {
  fieldLabelClassName,
  fieldSelectClassName,
} from "@/components/admin/forms/field-styles";
import {
  CARE_FEED_KIND_LABELS,
  filterCareFeed,
  type CareFeedItem,
  type CareFeedItemKind,
  type SealedLeaderSummary,
} from "@/lib/admin/care-note-feed";
import { prayerRequestStatusChipLabel } from "@/lib/admin/prayer-request-status";
import { formatIsoDateOr } from "@/lib/shared/date";
import { pluralize } from "@/lib/shared/pluralize";

// ADR 0023 — the Care area's Notes tab: every note the viewer may read, in one
// newest-first feed, with a presence-only summary of what stays sealed. The
// sealed block carries the SAME inline transparency toggle the per-leader
// detail page uses, so "3 notes sealed — turn on to read" is one click, not a
// navigation. Filters are client-side over the already-capped, already
// RLS-scoped items.

const MUTED_NOTE = "m-0 font-sans text-sm text-ink3";
const READ_FAILED_NOTE =
  "m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep";

const KIND_TONES: Record<CareFeedItemKind, BadgeTone> = {
  care_note: "blue",
  prayer_request: "sage",
  broad_note: "neutral",
};

const ALL = "all";

// One labelled filter <select> with a leading "All …" option — the three
// filter controls below differ only by label, id, options, and setter.
function FilterSelect({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={fieldLabelClassName} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={fieldSelectClassName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={ALL}>{allLabel}</option>
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

// Memoized: the feed re-renders on every filter change, but each item object is
// stable across those renders, so a memoized card skips re-rendering the rows
// that stayed in the filtered set.
const FeedItemCard = memo(function FeedItemCard({
  item,
}: {
  item: CareFeedItem;
}) {
  const about =
    item.subjectKind === "group"
      ? `About the group ${item.subjectName}`
      : `About ${item.subjectName}`;
  return (
    <li className="lg-cv-row list-none border-t border-lineSoft py-3 first:border-t-0 first:pt-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={KIND_TONES[item.kind]}>
          {CARE_FEED_KIND_LABELS[item.kind]}
        </Badge>
        {item.prayerStatus && item.prayerStatus !== "open" ? (
          <Badge tone={item.prayerStatus === "answered" ? "sage" : "neutral"}>
            {prayerRequestStatusChipLabel(item.prayerStatus)}
          </Badge>
        ) : null}
      </div>
      <p className="m-0 whitespace-pre-wrap font-sans text-base text-ink">
        {item.body}
      </p>
      <p className="m-0 mt-1.5 font-sans text-xs text-ink3">
        {about} · by {item.authorName}
        {item.viewerAuthored ? " (you)" : ""} · Recorded{" "}
        {formatIsoDateOr(item.occurredAt, "—")}
      </p>
    </li>
  );
});

function SealedSummaryBlock({
  sealedSummary,
  sealedAvailable,
}: {
  sealedSummary: SealedLeaderSummary[];
  sealedAvailable: boolean;
}) {
  if (!sealedAvailable) {
    return (
      <p className={MUTED_NOTE}>
        Sealed-note counts couldn&apos;t be loaded right now, so this list only
        shows what you can already read.
      </p>
    );
  }
  if (sealedSummary.length === 0) {
    return (
      <p className={MUTED_NOTE}>
        Nothing is sealed away from you right now — every note on record is in
        the list below.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <p className="m-0 font-sans text-sm text-ink2">
        These people hold notes that are sealed to their author. Counts only —
        turn a person&apos;s toggle on to let leadership read them.
      </p>
      <ul className="m-0 grid gap-3 p-0">
        {sealedSummary.map((s) => (
          <li
            key={s.profileId}
            className="grid list-none gap-2 border-t border-lineSoft pt-3"
          >
            <p className="m-0 font-sans text-base font-semibold text-ink">
              {s.name}
              <span className="ml-2 font-normal text-ink3">
                {summaryCounts(s)}
              </span>
            </p>
            <NoteTransparencyToggle
              subjectProfileId={s.profileId}
              granted={false}
              subjectName={s.name}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function summaryCounts(s: SealedLeaderSummary): string {
  const parts: string[] = [];
  if (s.careNoteCount > 0) {
    parts.push(pluralize(s.careNoteCount, "care note"));
  }
  if (s.prayerRequestCount > 0) {
    parts.push(pluralize(s.prayerRequestCount, "prayer request"));
  }
  return `${parts.join(" · ")} sealed`;
}

export function NotesFeedShell({
  items,
  sealedSummary,
  feedAvailable,
  sealedAvailable,
  namesAvailable,
}: {
  items: CareFeedItem[];
  sealedSummary: SealedLeaderSummary[];
  feedAvailable: boolean;
  sealedAvailable: boolean;
  // False when the author-name read failed: "Unknown person" labels then mean
  // "couldn't load", not "nobody knows who this is" — the notice says so.
  namesAvailable: boolean;
}) {
  const [leaderId, setLeaderId] = useState<string>(ALL);
  const [groupId, setGroupId] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);

  // Filter options come from the feed itself: leaders that notes are about or
  // (for group notes) by, and groups that notes are about.
  const { leaderOptions, groupOptions } = useMemo(() => {
    const leaders = new Map<string, string>();
    const groups = new Map<string, string>();
    for (const item of items) {
      if (item.subjectKind === "leader") {
        leaders.set(item.subjectId, item.subjectName);
      } else {
        groups.set(item.subjectId, item.subjectName);
        if (item.authorProfileId !== null) {
          leaders.set(item.authorProfileId, item.authorName);
        }
      }
    }
    const byName = (a: [string, string], b: [string, string]) =>
      a[1].localeCompare(b[1]);
    return {
      leaderOptions: [...leaders.entries()].sort(byName),
      groupOptions: [...groups.entries()].sort(byName),
    };
  }, [items]);

  const visible = useMemo(
    () =>
      filterCareFeed(items, {
        leaderId: leaderId === ALL ? undefined : leaderId,
        groupId: groupId === ALL ? undefined : groupId,
        kind: kind === ALL ? undefined : (kind as CareFeedItemKind),
      }),
    [items, leaderId, groupId, kind]
  );

  return (
    <div className="grid gap-5">
      {!namesAvailable ? (
        <p className={READ_FAILED_NOTE}>
          Some names couldn&apos;t be loaded right now, so people here may show
          as &ldquo;Unknown person&rdquo;. Try again shortly.
        </p>
      ) : null}
      <section className={cardClassName}>
        <h3 className={cardHeadingClassName}>Sealed notes</h3>
        <SealedSummaryBlock
          sealedSummary={sealedSummary}
          sealedAvailable={sealedAvailable}
        />
      </section>

      <section className={cardClassName}>
        <h3 className={cardHeadingClassName}>All notes you can read</h3>
        {!feedAvailable ? (
          <p className={READ_FAILED_NOTE}>
            Some notes couldn&apos;t be loaded right now, so this list may be
            incomplete. Try again shortly.
          </p>
        ) : null}
        <div className="mb-4 mt-3 grid grid-cols-1 items-end gap-3.5 md:grid-cols-3">
          <FilterSelect
            id="notes-feed-leader"
            label="Shepherd"
            allLabel="All shepherds"
            value={leaderId}
            options={leaderOptions}
            onChange={setLeaderId}
          />
          <FilterSelect
            id="notes-feed-group"
            label="Group"
            allLabel="All groups"
            value={groupId}
            options={groupOptions}
            onChange={setGroupId}
          />
          <FilterSelect
            id="notes-feed-kind"
            label="Type"
            allLabel="All types"
            value={kind}
            options={Object.entries(CARE_FEED_KIND_LABELS)}
            onChange={setKind}
          />
        </div>
        {visible.length === 0 ? (
          <p className={MUTED_NOTE}>
            {items.length === 0
              ? "No notes you can read yet. Notes you write are always yours to read; others appear when their person's transparency toggle is on."
              : "No notes match these filters."}
          </p>
        ) : (
          <ul className="m-0 p-0">
            {visible.map((item) => (
              <FeedItemCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
