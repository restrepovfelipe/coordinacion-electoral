-- Migration: add correo to Testigo, unique cedula, create Jurado table

-- 1. Add correo column to Testigo
ALTER TABLE "Testigo" ADD COLUMN "correo" TEXT;

-- 2. Add unique constraint on Testigo.cedula
--    NULL values are allowed in unique indexes in Postgres (multiple NULLs don't conflict).
CREATE UNIQUE INDEX "Testigo_cedula_key" ON "Testigo"("cedula");

-- 3. Create Jurado table
CREATE TABLE "Jurado" (
    "id"              SERIAL NOT NULL,
    "cedula"          TEXT NOT NULL,
    "nombre"          TEXT NOT NULL,
    "telefono"        TEXT,
    "correo"          TEXT,
    "puestoId"        INTEGER,
    "puestoNombreCsv" TEXT,
    "municipio"       TEXT NOT NULL,
    "estado"          TEXT NOT NULL DEFAULT 'confirmado',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jurado_pkey" PRIMARY KEY ("id")
);

-- 4. Unique constraint on Jurado.cedula
CREATE UNIQUE INDEX "Jurado_cedula_key" ON "Jurado"("cedula");

-- 5. Indexes on Jurado
CREATE INDEX "Jurado_puestoId_idx" ON "Jurado"("puestoId");
CREATE INDEX "Jurado_municipio_idx" ON "Jurado"("municipio");

-- 6. Foreign key: Jurado.puestoId -> Puesto.id
ALTER TABLE "Jurado" ADD CONSTRAINT "Jurado_puestoId_fkey"
    FOREIGN KEY ("puestoId") REFERENCES "Puesto"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
