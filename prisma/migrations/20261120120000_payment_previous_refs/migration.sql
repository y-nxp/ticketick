-- Transactions des tentatives de paiement précédentes d'une commande.
ALTER TABLE "Payment" ADD COLUMN "previousRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
