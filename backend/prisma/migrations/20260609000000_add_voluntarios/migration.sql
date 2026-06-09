-- CreateTable
CREATE TABLE "Voluntario" (
    "id" SERIAL NOT NULL,
    "comunaId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "cedula" TEXT,
    "phone" TEXT,
    "correo" TEXT,
    "rol" TEXT,
    "status" TEXT NOT NULL DEFAULT 'activo',
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voluntario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Voluntario_comunaId_idx" ON "Voluntario"("comunaId");

-- AddForeignKey
ALTER TABLE "Voluntario" ADD CONSTRAINT "Voluntario_comunaId_fkey" FOREIGN KEY ("comunaId") REFERENCES "Comuna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voluntario" ADD CONSTRAINT "Voluntario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
