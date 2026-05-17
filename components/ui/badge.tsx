import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium", className)} {...props} />; }
