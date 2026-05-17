import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="min-h-screen muted-grid">
      <div className="container space-y-8 py-10 md:py-16">
        <section className="app-surface p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Phase 1 Preview</p>
          <h1 className="mt-3 text-4xl font-semibold md:text-5xl">Life Group Operations Dashboard</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">A calm, modern ministry operations command center for admins and life group leaders. This phase delivers deployment-safe foundations, reusable UI patterns, and polished preview workflows.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className={cn(buttonVariants({ variant: "default" }))} href="/admin-preview">Open Admin Preview</Link>
            <Link className={cn(buttonVariants({ variant: "outline" }))} href="/leader-preview">Open Leader Preview</Link>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Warm & Trustworthy", "Balanced tones, clear hierarchy, and people-first language for ministry teams."],
            ["Operational Clarity", "Purpose-built cards and badges to surface status without dashboard clutter."],
            ["Built for Vercel Hobby", "No required runtime env vars or paid services for Phase 1 deployment."],
          ].map(([title, description]) => (
            <Card key={title} className="app-surface"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{description}</CardContent></Card>
          ))}
        </section>
      </div>
    </main>
  );
}
