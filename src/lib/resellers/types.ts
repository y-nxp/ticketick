/** Résultat d'une vente au guichet, lisible par le composant client. */
export type PosSaleState =
  | {
      ok: true;
      orderId: string;
      reference: string;
      /** Billets valables : PDF à imprimer. */
      pdfUrl?: string;
      /** Carte en ligne : lien et QR à montrer au client. */
      payUrl?: string;
      payQr?: string;
      emailed: boolean;
    }
  | { ok: false; error: string; ticketTypeId?: string }
  | undefined;

/** Nouveau QR d'un paiement en ligne resté ouvert. */
export type PosPayLinkState =
  | { ok: true; payUrl: string; payQr: string }
  | { ok: false; error: string }
  | undefined;

export type AgentInviteState =
  | { ok: true; email: string }
  | { ok: false; error: string }
  | undefined;
