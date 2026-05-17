type SectionHeaderProps = { title: string; description?: string };

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold">{title}</h3>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
