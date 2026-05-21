-- DropForeignKey
ALTER TABLE "Testigo" DROP CONSTRAINT "Testigo_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Testigo" DROP CONSTRAINT "Testigo_puestoId_fkey";

-- AlterTable
ALTER TABLE "Testigo" ALTER COLUMN "puestoId" DROP NOT NULL,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Testigo" ADD CONSTRAINT "Testigo_puestoId_fkey" FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testigo" ADD CONSTRAINT "Testigo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
