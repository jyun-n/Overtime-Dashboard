-- AlterTable
ALTER TABLE "IpAcl" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "ownerName" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "IpAcl_userId_idx" ON "IpAcl"("userId");

-- AddForeignKey
ALTER TABLE "IpAcl" ADD CONSTRAINT "IpAcl_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
