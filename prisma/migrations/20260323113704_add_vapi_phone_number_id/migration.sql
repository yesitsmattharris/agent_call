/*
  Warnings:

  - A unique constraint covering the columns `[vapiPhoneNumberId]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Tenant_phoneNumber_key";

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "vapiPhoneNumberId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_vapiPhoneNumberId_key" ON "Tenant"("vapiPhoneNumberId");
