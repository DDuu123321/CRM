-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "externalId" TEXT;

-- CreateTable
CREATE TABLE "SyncState" (
    "source" TEXT NOT NULL,
    "cursor" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("source")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_externalId_key" ON "Deal"("externalId");
