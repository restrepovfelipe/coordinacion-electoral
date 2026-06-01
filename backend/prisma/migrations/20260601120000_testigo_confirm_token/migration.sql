-- Add magic link token and confirmation timestamps to Testigo
ALTER TABLE "Testigo" ADD COLUMN IF NOT EXISTS "token"        TEXT;
ALTER TABLE "Testigo" ADD COLUMN IF NOT EXISTS "confirmadoAt" TIMESTAMPTZ;
ALTER TABLE "Testigo" ADD COLUMN IF NOT EXISTS "acreditadoAt" TIMESTAMPTZ;
ALTER TABLE "Testigo" ADD COLUMN IF NOT EXISTS "enPuestoAt"   TIMESTAMPTZ;

-- Backfill tokens for existing testigos using gen_random_uuid()
UPDATE "Testigo" SET "token" = gen_random_uuid()::TEXT WHERE "token" IS NULL;

-- Now enforce NOT NULL and UNIQUE
ALTER TABLE "Testigo" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Testigo_token_key" ON "Testigo"("token");
