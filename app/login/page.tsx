import { SignInScreen } from "@/components/sign-in/sign-in-screen";
import { parseSignInSearchParams, type SignInSearchParams } from "./next-path";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SignInSearchParams;
}) {
  const { next, resetOk } = await parseSignInSearchParams(searchParams);
  return <SignInScreen next={next} resetOk={resetOk} />;
}
