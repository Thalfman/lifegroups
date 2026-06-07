import { redirect } from "next/navigation";

// Route alias: /admin/multiply is read-only and its setup lives in Settings, so
// the natural-guess /admin/multiply/settings used to 404. Redirect it to the
// Settings › Groups tab (where group types — the Multiply grid's rows — are set
// up) via the `?tab=` deep link.
export default function MultiplySettingsAlias() {
  redirect("/admin/settings?tab=groups");
}
