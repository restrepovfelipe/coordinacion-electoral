-- Replace single-column puestoId index with composite (puestoId, id) to support
-- the paginated list query that orders by both columns simultaneously.
DROP INDEX IF EXISTS "Testigo_puestoId_idx";
CREATE INDEX "Testigo_puestoId_id_idx" ON "Testigo"("puestoId", "id");
