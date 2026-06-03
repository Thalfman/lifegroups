import { SignInScreen } from "@/components/sign-in/sign-in-screen";

// Statically generated and CDN-served: the sign-in screen has no per-request
// server data. The `next` / `reset` search params are read client-side inside
// LoginForm, so this route renders no serverless function on a cold visit —
// near-instant TTFB for the public landing/sign-in path.
export default function LoginPage() {
  return <SignInScreen />;
}
