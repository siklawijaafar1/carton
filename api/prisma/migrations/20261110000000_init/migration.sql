-- CreateEnum
CREATE TYPE "PackType" AS ENUM ('BASIC', 'PRO', 'SUPER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('WAITING_PAYMENT', 'QUEUED', 'GENERATING', 'SENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "pack" "PackType" NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessToken" TEXT NOT NULL,
    "eventTitle" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Abidjan',
    "message" TEXT,
    "dressCode" TEXT,
    "design" JSONB NOT NULL,
    "backgroundUrl" TEXT,
    "fulfillment" "FulfillmentStatus" NOT NULL DEFAULT 'WAITING_PAYMENT',
    "fulfillmentNote" TEXT,
    "archivePath" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" "RsvpStatus" NOT NULL DEFAULT 'PENDING',
    "callDone" BOOLEAN NOT NULL DEFAULT false,
    "rsvpToken" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "seats" INTEGER NOT NULL DEFAULT 1,
    "rsvpNote" TEXT,
    "cardPath" TEXT,
    "delivery" "DeliveryStatus" NOT NULL DEFAULT 'NOT_SENT',
    "deliveryInfo" TEXT,
    "sentAt" TIMESTAMP(3),
    "callNote" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "provider" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_transactionId_key" ON "Order"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Guest_rsvpToken_key" ON "Guest"("rsvpToken");

-- CreateIndex
CREATE INDEX "Guest_orderId_status_idx" ON "Guest"("orderId", "status");

-- CreateIndex
CREATE INDEX "PaymentEvent_reference_idx" ON "PaymentEvent"("reference");

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
