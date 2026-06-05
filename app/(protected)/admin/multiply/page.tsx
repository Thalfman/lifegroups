import { requireAdmin } from "@/lib/auth/session";
import { AreaPlaceholder } from "@/components/admin/area-placeholder";

// Multiply area (ADR 0016 / 0019, #372). Multiply is the per-group-type
// multiplication read — three boards (Men's / Women's / Mixed), each scored by
// four pillars (Capacity, Interest, Group Health, Leader Health) plus a
// Julian-owned trigger. The former Launch Planning + admin Calendar stay
// direct-URL aliases (NAV_ALIAS_TO_CANONICAL marks Multiply active for them).
// This slice ships only the nav entry + a minimal "being built" shell; the
// boards land in #380.
export const dynamic = "force-dynamic";

export default async function AdminMultiplyPage() {
  await requireAdmin();
  return (
    <AreaPlaceholder
      eyebrow="Multiply"
      title="When to"
      italic="multiply"
      lede="A read on which group types are ready to multiply — by type, not by individual group."
      building="The per-type multiplication boards are being built here — four pillars per type and the trigger that tells you when a type is ready. Launch planning and the calendar still live at their existing URLs in the meantime."
    />
  );
}
