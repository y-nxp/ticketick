-- Placement libre : places mises de côté pour les invités, hors jauge.
ALTER TABLE "EventSession" ADD COLUMN "inviteSeats" INTEGER NOT NULL DEFAULT 0;
