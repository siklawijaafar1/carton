-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progressTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Guest_orderId_updatedAt_idx" ON "Guest"("orderId", "updatedAt");
