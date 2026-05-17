import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(protected)/actions";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function UnauthorizedPage() {
  const session = await getCurrentSession();
  const hasLinkedProfile = !!session?.profile;
  const isSignedIn = !!session;

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Access not available</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Your account doesn&apos;t have access to that dashboard.
              {isSignedIn && !hasLinkedProfile
                ? " Your sign-in succeeded, but your auth user isn't linked to a ministry profile yet — please ask a ministry admin to link your account."
                : " If you think this is wrong, contact a ministry admin."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/">Back to home</Link>
              </Button>
              {isSignedIn ? (
                <form action={logoutAction}>
                  <Button type="submit">Sign out</Button>
                </form>
              ) : (
                <Button asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
