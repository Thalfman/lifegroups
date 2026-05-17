import { cn } from "@/lib/utils";

type Tone = "healthy" | "watch" | "followup";
type Lifecycle = "Active" | "Planned Pause" | "Seasonal Break" | "Restart Soon" | "Overdue Restart";

const healthToneMap: Record<Tone, string> = {
  healthy: "bg-emerald-100 text-emerald-800 border-emerald-200",
  watch: "bg-amber-100 text-amber-800 border-amber-200",
  followup: "bg-rose-100 text-rose-800 border-rose-200",
};

const lifecycleToneMap: Record<Lifecycle, string> = {
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Planned Pause": "bg-blue-100 text-blue-800 border-blue-200",
  "Seasonal Break": "bg-violet-100 text-violet-800 border-violet-200",
  "Restart Soon": "bg-amber-100 text-amber-800 border-amber-200",
  "Overdue Restart": "bg-rose-100 text-rose-800 border-rose-200",
};

export function HealthBadge({ tone, label }: { tone: Tone; label?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", healthToneMap[tone])}>{label ?? tone}</span>;
}

export function LifecycleBadge({ status }: { status: Lifecycle }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", lifecycleToneMap[status])}>{status}</span>;
}
