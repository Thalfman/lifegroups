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
  if (session) {
    if (session.profile?.status === "active") {
      redirect(defaultLandingPathForRole(session.profile.role));
    }
    redirect("/unauthorized");
  }

  const { next, resetOk } = await parseSignInSearchParams(searchParams);
  return <SignInScreen next={next} resetOk={resetOk} />;
}
