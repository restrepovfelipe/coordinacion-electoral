-- Add ad-hoc coordinator fields to Subregion
ALTER TABLE "Subregion" ADD COLUMN IF NOT EXISTS "coordinadorAdHocNombre"   TEXT;
ALTER TABLE "Subregion" ADD COLUMN IF NOT EXISTS "coordinadorAdHocTelefono" TEXT;

-- Add notas field to Puesto
ALTER TABLE "Puesto" ADD COLUMN IF NOT EXISTS "notas" TEXT;
