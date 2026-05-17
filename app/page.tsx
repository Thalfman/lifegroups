import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl p-6 md:p-10">
      <section className="space-y-6">
        <Badge>Phase 0 Foundation</Badge>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Life Group Operations Dashboard</h1>
        <p className="max-w-3xl text-muted-foreground">A calm, modern operations hub for ministry admins and life group leaders. This starter focuses on clean architecture and deployment readiness for Vercel + Supabase free tier.</p>
        <div className="flex gap-3"><Button>Phase 1: Auth + Roles</Button><Button variant="outline">View Roadmap</Button></div>
      </section>
      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {[
          ["Admin Visibility", "Cross-group insights, health, follow-ups, and weekly rhythm management."],
          ["Leader Simplicity", "Single-group workflows designed to reduce admin overhead for leaders."],
          ["Free-tier Ready", "Structured for Vercel Hobby + Supabase Free with no paid dependencies."],
        ].map(([title, description]) => (
          <Card key={title}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{description}</CardContent></Card>
        ))}
      </section>
    </main>
  );
}
