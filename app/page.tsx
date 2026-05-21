import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { defaultLandingPathForRole } from "@/lib/auth/roles";
import { SignInScreen } from "@/components/sign-in/sign-in-screen";
import {
  parseSignInSearchParams,
  type SignInSearchParams,
} from "./login/next-path";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: SignInSearchParams;
}) {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "authenticated":
      if (session.profile.status === "active") {
        redirect(defaultLandingPathForRole(session.profile.role));
      }
      redirect("/unauthorized");
    case "profile_missing":
      redirect("/unauthorized");
    case "backend_error":
      redirect("/unauthorized?reason=unavailable");
    case "anonymous":
      // fall through to render the sign-in screen below
      break;
  }

  const { next, resetOk } = await parseSignInSearchParams(searchParams);
  return <SignInScreen next={next} resetOk={resetOk} />;
}
