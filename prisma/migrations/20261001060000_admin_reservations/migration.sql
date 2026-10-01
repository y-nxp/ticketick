-- Réservations saisies depuis l'admin, sans paiement
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'RESERVATION';

ALTER TABLE "Order" ADD COLUMN "ticketNote" TEXT;
