-- T94: add ad-hoc coordinator fields to Municipio, Zona, Comuna, Puesto
-- Also adds Puesto.tag. All columns nullable — backwards-compatible.

ALTER TABLE "Municipio"
  ADD COLUMN IF NOT EXISTS "coordinadorAdHocNombre"   TEXT,
  ADD COLUMN IF NOT EXISTS "coordinadorAdHocTelefono" TEXT;

ALTER TABLE "Zona"
  ADD COLUMN IF NOT EXISTS "coordinadorAdHocNombre"   TEXT,
  ADD COLUMN IF NOT EXISTS "coordinadorAdHocTelefono" TEXT;

ALTER TABLE "Comuna"
  ADD COLUMN IF NOT EXISTS "coordinadorAdHocNombre"   TEXT,
  ADD COLUMN IF NOT EXISTS "coordinadorAdHocTelefono" TEXT;

ALTER TABLE "Puesto"
  ADD COLUMN IF NOT EXISTS "tag"                      TEXT,
  ADD COLUMN IF NOT EXISTS "coordinadorAdHocNombre"   TEXT,
  ADD COLUMN IF NOT EXISTS "coordinadorAdHocTelefono" TEXT;
