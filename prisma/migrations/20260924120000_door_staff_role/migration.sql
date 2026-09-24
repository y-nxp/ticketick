-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'DOOR_STAFF';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "doorOrganizerId" TEXT;

-- CreateIndex
CREATE INDEX "User_doorOrganizerId_idx" ON "User"("doorOrganizerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_doorOrganizerId_fkey" FOREIGN KEY ("doorOrganizerId") REFERENCES "Organizer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
