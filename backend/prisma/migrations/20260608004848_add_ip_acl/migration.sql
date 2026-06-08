-- CreateTable
CREATE TABLE "IpAcl" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpAcl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IpAcl_ip_key" ON "IpAcl"("ip");

-- CreateIndex
CREATE INDEX "IpAcl_isActive_idx" ON "IpAcl"("isActive");

-- AddForeignKey
ALTER TABLE "IpAcl" ADD CONSTRAINT "IpAcl_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
