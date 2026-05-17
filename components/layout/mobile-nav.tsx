import Link from "next/link";

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-card p-2 md:hidden">
      <ul className="grid grid-cols-3 gap-2">
        <li><Link className="block rounded-md px-3 py-2 text-center text-xs font-medium hover:bg-muted" href="/">Home</Link></li>
        <li><Link className="block rounded-md px-3 py-2 text-center text-xs font-medium hover:bg-muted" href="/admin-preview">Admin</Link></li>
        <li><Link className="block rounded-md px-3 py-2 text-center text-xs font-medium hover:bg-muted" href="/leader-preview">Leader</Link></li>
      </ul>
    </nav>
  );
}
