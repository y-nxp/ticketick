export function ContentPage({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="container-page max-w-3xl py-16">
      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      <div className="prose mt-6 max-w-none space-y-4 text-muted-foreground">
        {children ?? (
          <p>
            Cette page sera bientôt disponible. / This page will be available
            soon.
          </p>
        )}
      </div>
    </div>
  );
}
