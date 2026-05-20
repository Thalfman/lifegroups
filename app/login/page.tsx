import { SignInScreen } from "@/components/sign-in/sign-in-screen";
import { isSafeNextPath } from "./next-path";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  next?: string | string[];
  reset?: string | string[];
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const nextRaw = params.next;
  const nextValue = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const next = nextValue && isSafeNextPath(nextValue) ? nextValue : null;
  const resetRaw = params.reset;
  const resetValue = Array.isArray(resetRaw) ? resetRaw[0] : resetRaw;
  const resetOk = resetValue === "ok";

  return <SignInScreen next={next} resetOk={resetOk} />;
}
