import { cn } from "@/lib/utils";

export function ConfiguredDataNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800",
        className,
      )}
    >
      Reading live data from Supabase. No writes or auth in Phase 3.
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
