import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { defaultLandingPathForRole } from "@/lib/auth/roles";
import { SignInScreen } from "@/components/sign-in/sign-in-screen";
import { isSafeNextPath } from "./login/next-path";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  next?: string | string[];
  reset?: string | string[];
}>;

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentSession();
  if (session?.profile && session.profile.status === "active") {
    redirect(defaultLandingPathForRole(session.profile.role));
  }

  const params = await searchParams;
  const nextRaw = params.next;
  const nextValue = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const next = nextValue && isSafeNextPath(nextValue) ? nextValue : null;
  const resetRaw = params.reset;
  const resetValue = Array.isArray(resetRaw) ? resetRaw[0] : resetRaw;
  const resetOk = resetValue === "ok";

  return <SignInScreen next={next} resetOk={resetOk} />;
}
