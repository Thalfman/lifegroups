import Link from "next/link";
import { cn } from "@/lib/utils";

export function ConfiguredDataNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800",
        className,
      )}
    >
      Reading live data from Supabase, scoped by Row Level Security to your role.
    </div>
  );
}

export function ReadOnlyDataNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800",
        className,
      )}
    >
      Ministry-wide read-only view. No write actions are wired up in this phase.
    </div>
  );
}

export function FallbackDataNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900",
        className,
      )}
    >
      Showing fallback demo content. Set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to read live data.
    </div>
  );
}

export function PublicPreviewNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900",
        className,
      )}
    >
      Public design preview — demo data only.{" "}
      <Link href="/login" className="font-medium underline">
        Sign in
      </Link>{" "}
      to see your real ministry data.
    </div>
  );
}

export function DashboardErrorNotice({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900",
        className,
      )}
    >
      Supabase read failed; falling back to demo data.{" "}
      <span className="font-mono text-[11px] opacity-80">{message}</span>
    </div>
  );
}
