ALTER TABLE "Puesto"  ADD COLUMN IF NOT EXISTS "coordinadorAdHocCedula"    TEXT;
ALTER TABLE "Puesto"  ADD COLUMN IF NOT EXISTS "coordinadorAdHocCorreo"    TEXT;
ALTER TABLE "Puesto"  ADD COLUMN IF NOT EXISTS "coordinadorAdHocCedula2"   TEXT;
ALTER TABLE "Puesto"  ADD COLUMN IF NOT EXISTS "coordinadorAdHocCorreo2"   TEXT;
ALTER TABLE "Comuna" ADD COLUMN IF NOT EXISTS "coordinadorAdHocCedula"    TEXT;
ALTER TABLE "Comuna" ADD COLUMN IF NOT EXISTS "coordinadorAdHocCorreo"    TEXT;
