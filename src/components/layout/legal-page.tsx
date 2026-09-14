import { ContentPage } from "./content-page";
import type { LegalDoc } from "@/lib/legal/copy";

export function LegalPage({ title, doc }: { title: string; doc: LegalDoc }) {
  return (
    <ContentPage title={title}>
      <p>{doc.lead}</p>
      {doc.sections.map((section) => (
        <section key={section.title}>
          <h2 className="mt-8 text-lg font-semibold text-foreground">
            {section.title}
          </h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p className="pt-4 text-sm">{doc.updated}</p>
    </ContentPage>
  );
}
