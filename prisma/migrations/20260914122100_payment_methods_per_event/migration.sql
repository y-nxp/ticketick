-- Moyens d'encaissement au spectacle, surcharge facultative par séance.

ALTER TABLE "Event" ADD COLUMN "acceptCard" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Event" ADD COLUMN "acceptIban" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "EventSession" ADD COLUMN "acceptCard" BOOLEAN;
ALTER TABLE "EventSession" ADD COLUMN "acceptIban" BOOLEAN;
