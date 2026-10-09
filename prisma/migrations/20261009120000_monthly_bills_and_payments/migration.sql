-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('PAID', 'PENDING', 'LATE');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('RECEIPT', 'MANUAL');

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "status",
ADD COLUMN     "billAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "billId" TEXT,
ADD COLUMN     "kilowattHours" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "token" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "monthlyAmount" DECIMAL(65,30);

-- DropEnum
DROP TYPE "SubscriptionStatus";

-- CreateTable
CREATE TABLE "MonthlyBill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amountDue" DECIMAL(65,30) NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyBill_userId_month_key" ON "MonthlyBill"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_token_key" ON "Subscription"("token");

-- CreateIndex
CREATE INDEX "Subscription_userId_purchasedAt_idx" ON "Subscription"("userId", "purchasedAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_billId_fkey" FOREIGN KEY ("billId") REFERENCES "MonthlyBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyBill" ADD CONSTRAINT "MonthlyBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

