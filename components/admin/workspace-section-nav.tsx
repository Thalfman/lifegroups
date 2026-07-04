// Compact in-page section nav for long Super Admin workspaces (Access, Config).
// Plain anchor links: the browser's native hash jump does the scrolling, and the
// anchored sections carry SUPER_ADMIN_STICKY_ANCHOR_OFFSET as scrollMarginTop so
// the target clears the sticky TopBar + workspace tab rail. Deliberately quieter
// than the workspace tabs — small text links on a bare row, no rail chrome — so
// it reads as "jump within this page", not a second tab tier.

export type WorkspaceSection = {
  id: string;
  label: string;
};

export function WorkspaceSectionNav({
  sections,
  ariaLabel,
}: {
  sections: WorkspaceSection[];
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      // text-[12.5px] keeps the original off-scale size (between xs and sm).
      className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 font-sans text-[12.5px] leading-[1.2]"
    >
      <span className="font-medium text-ink3">On this page:</span>
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="font-semibold text-ink2 underline decoration-line underline-offset-[3px]"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
