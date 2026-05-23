-- Amendment A16: Add mesa assignment fields to Testigo.
-- mesaInicial/mesaFinal track which mesas a testigo is responsible for.
-- App-level invariants (not DB constraints):
--   mesaInicial <= mesaFinal when both present
--   mesaFinal - mesaInicial + 1 <= 5
--   mesaFinal <= puesto.mesas
-- Populated by AsignacionService.reassignPuesto() on every testigo create/update/delete.

ALTER TABLE "Testigo" ADD COLUMN "mesaInicial" INTEGER;
ALTER TABLE "Testigo" ADD COLUMN "mesaFinal"   INTEGER;
