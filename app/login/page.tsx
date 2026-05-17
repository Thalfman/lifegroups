import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string | string[] }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const nextRaw = params.next;
  const nextValue = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const next = nextValue && nextValue.startsWith("/") ? nextValue : null;
  const configured = isSupabaseConfigured();

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Life Group Operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ministry admins, staff, and life group leaders.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Use your account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!configured ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Authentication is not configured on this deployment. Set the Supabase
                environment variables to enable sign-in.
              </p>
            ) : null}
            <LoginForm next={next} />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Not a user yet? Ask a ministry admin to invite you, or browse the{" "}
          <Link href="/admin-preview" className="underline">
            admin
          </Link>{" "}
          and{" "}
          <Link href="/leader-preview" className="underline">
            leader
          </Link>{" "}
          design previews.
        </p>
      </div>
    </div>
  );
}
