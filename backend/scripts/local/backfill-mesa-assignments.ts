/**
 * A16 Backfill — backfill-mesa-assignments.ts
 *
 * Computes mesaInicial / mesaFinal for every existing testigo
 * using the A16 contiguous-range algorithm (max 5 mesas per testigo).
 *
 * Each puesto is processed atomically in its own transaction.
 * Safe to re-run — idempotent (overwrites existing values).
 *
 * Run: pnpm tsx scripts/local/backfill-mesa-assignments.ts
 * Preconditions:
 *   - Cloud SQL proxy running on localhost:5432, DATABASE_URL set in .env.local
 *   - Migration 20260522100000_add_testigo_mesa_assignment already applied
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '../../.env.local'));

const MAX_PER_TESTIGO = 5;
const prisma = new PrismaClient();

async function main() {
  const puestos = await prisma.puesto.findMany({
    select: { id: true, name: true, mesas: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Backfilling ${puestos.length} puestos...`);
  let updated = 0;
  let skipped = 0;

  for (const puesto of puestos) {
    const testigos = await prisma.testigo.findMany({
      where: { puestoId: puesto.id },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (!testigos.length) { skipped++; continue; }

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < testigos.length; i++) {
        const mesaInicial = i * MAX_PER_TESTIGO + 1;
        const mesaFinal = Math.min((i + 1) * MAX_PER_TESTIGO, puesto.mesas);
        if (mesaInicial > puesto.mesas) {
          await tx.testigo.update({
            where: { id: testigos[i].id },
            data: { mesaInicial: null, mesaFinal: null },
          });
        } else {
          await tx.testigo.update({
            where: { id: testigos[i].id },
            data: { mesaInicial, mesaFinal },
          });
        }
      }
    });

    updated++;
    if (updated % 50 === 0) {
      console.log(`  ${updated} / ${puestos.length - skipped} puestos processed...`);
    }
  }

  console.log(`Done. Updated ${updated} puestos, skipped ${skipped} (no testigos).`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
