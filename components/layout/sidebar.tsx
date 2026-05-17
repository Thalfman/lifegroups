import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/admin-preview", label: "Admin Preview" },
  { href: "/leader-preview", label: "Leader Preview" },
];

export function Sidebar() {
  return (
    <aside className="hidden border-r bg-card p-4 md:block">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Life Groups</p>
        <h2 className="text-lg font-semibold">Operations Dashboard</h2>
      </div>
      <nav className="space-y-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
