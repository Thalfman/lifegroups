import { SectionHeader } from "@/components/layout/shell";

export function OwnerControlsOverview() {
  return (
    <section className="grid gap-4">
      <SectionHeader
        eyebrow="Owner controls"
        title="What lives here"
        description="The owner/operator console. Everyone else &mdash; ministry admins, leaders, co-leaders &mdash; runs their day-to-day from /admin and /leader; nothing here is needed for routine ministry work."
      />
      <div className="grid gap-2.5 rounded-lg border border-line bg-surface p-card font-sans text-base text-ink2">
        <p className="m-0">
          <strong className="text-ink">Audit log.</strong> Every admin and
          leader write &mdash; create, assign, deactivate, close, reopen,
          check-in, role change &mdash; is recorded here, newest first. Only the
          owner account can read it.
        </p>
        <p className="m-0">
          <strong className="text-ink">Role management.</strong> The only place
          to change a profile&rsquo;s role. The owner role itself can&rsquo;t be
          assigned from the app, and you can&rsquo;t change your own role.
        </p>
        <p className="m-0">
          <strong className="text-ink">System status.</strong> A short checklist
          that surfaces whether the underlying data and audit access are in
          place. Useful right after first setting up the app.
        </p>
      </div>
    </section>
  );
}
