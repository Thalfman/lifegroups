import { PageHeader, PageBody } from "@/components/lg/PageHeader";

// Minimal "being built" shell for a pivot area whose feature slice has not
// landed yet (ADR 0016, #372). Plan (#375) and Multiply (#380) ship their nav
// entry + a placeholder so the new spine is coherent on day one — nothing
// half-built renders as the default. Each shell is a guarded admin route (the
// page runs requireAdmin); this component is pure chrome.
export function AreaPlaceholder({
  eyebrow,
  title,
  italic,
  lede,
  building,
}: {
  eyebrow: string;
  title: string;
  italic?: string;
  lede: string;
  // One line describing what this area will hold once its slice lands.
  building: string;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} italic={italic} lede={lede} />
      <PageBody>
        <div
          role="status"
          style={{
            border: "1px solid var(--c-line)",
            background: "var(--c-surface)",
            borderRadius: 12,
            padding: "28px 26px",
            maxWidth: 560,
            fontFamily: "var(--font-body)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--c-clay)",
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Being built
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--c-ink2)",
            }}
          >
            {building}
          </p>
        </div>
      </PageBody>
    </>
  );
}
