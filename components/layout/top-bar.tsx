type TopBarProps = { title: string; subtitle: string };

export function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <header className="border-b bg-background/90 px-4 py-4 backdrop-blur md:px-6">
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
    </header>
  );
}
