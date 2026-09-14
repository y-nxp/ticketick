"use client";

import * as React from "react";

/**
 * Signale la hauteur du widget au parent (WordPress) pour que l'iframe
 * s'ajuste, plutôt que d'afficher un ascenseur intérieur.
 */
export function EmbedFrame({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const publish = () => {
      const height = Math.ceil(root.getBoundingClientRect().height);
      window.parent.postMessage({ type: "ticketick-embed", height }, "*");
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="bg-background p-4 sm:p-5">
      {children}
    </div>
  );
}
