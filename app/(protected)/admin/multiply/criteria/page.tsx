import { redirect } from "next/navigation";

// Route alias: the natural-guess /admin/multiply/criteria used to 404. The
// multiplication trigger/criteria are configured in Settings › Multiply, so
// redirect there via the `?tab=` deep link.
export default function MultiplyCriteriaAlias() {
  redirect("/admin/settings?tab=multiply");
}
