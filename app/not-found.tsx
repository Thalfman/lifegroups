import { AppErrorState } from "@/components/lg/AppErrorState";
import { LinkButton } from "@/components/ui/button";

// App-wide branded 404 (repo-sweep #587). A bad dynamic id (detail pages call
// `notFound()`) or a mistyped URL renders this instead of Next's default,
// off-brand 404 — in the app's visual language with a clear way back home.
//
// This is a Server Component but renders no live data: it never touches
// Supabase, so unauthenticated / public 404s render the same way without a
// database round-trip.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg font-sans text-ink">
      <AppErrorState
        title="Page not found"
        message="We couldn't find that page. It may have moved, or the link may be out of date."
        action={
          <LinkButton href="/" variant="primary">
            Go to home
          </LinkButton>
        }
      />
    </div>
  );
}
