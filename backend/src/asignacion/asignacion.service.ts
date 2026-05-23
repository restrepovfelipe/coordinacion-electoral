import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

const MAX_MESAS_PER_TESTIGO = 5;

@Injectable()
export class AsignacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Recompute mesaInicial / mesaFinal for every testigo in a puesto.
   *
   * Algorithm (A16):
   *   Sort testigos by id ASC. Assign contiguous ranges of up to 5 mesas each.
   *   testigo[i] → mesaInicial = i*5 + 1, mesaFinal = min((i+1)*5, totalMesas).
   *   If mesaInicial > totalMesas the testigo is over-capacity → both null.
   *
   * Can be called inside an existing transaction by passing `tx`.
   */
  async reassignPuesto(
    puestoId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;

    const puesto = await db.puesto.findUnique({
      where: { id: puestoId },
      select: { mesas: true },
    });
    if (!puesto) throw new NotFoundException('Puesto not found');

    const totalMesas = puesto.mesas ?? 0;

    const testigos = await db.testigo.findMany({
      where: { puestoId },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    for (let i = 0; i < testigos.length; i++) {
      const mesaInicial = i * MAX_MESAS_PER_TESTIGO + 1;
      const mesaFinal = Math.min((i + 1) * MAX_MESAS_PER_TESTIGO, totalMesas);

      if (mesaInicial > totalMesas) {
        await db.testigo.update({
          where: { id: testigos[i].id },
          data: { mesaInicial: null, mesaFinal: null },
        });
      } else {
        await db.testigo.update({
          where: { id: testigos[i].id },
          data: { mesaInicial, mesaFinal },
        });
      }
    }
  }

  /**
   * Public endpoint handler: recalculate and emit SSE event.
   */
  async recalcularPuesto(puestoId: number): Promise<{ puestoId: number; mesasAsignadas: number }> {
    const puesto = await this.prisma.puesto.findUnique({
      where: { id: puestoId },
      select: { mesas: true, municipioId: true },
    });
    if (!puesto) throw new NotFoundException('Puesto not found');

    await this.prisma.$transaction(async (tx) => {
      await this.reassignPuesto(puestoId, tx);
    });

    const rows = await this.prisma.testigo.findMany({
      where: { puestoId, mesaInicial: { not: null } },
      select: { mesaInicial: true, mesaFinal: true },
    });
    const mesasAsignadas = rows.reduce(
      (sum, r) => sum + ((r.mesaFinal ?? 0) - (r.mesaInicial ?? 0) + 1),
      0,
    );

    await this.realtime.notify({
      type: 'asignacion:puesto_changed',
      puestoId,
      municipioId: puesto.municipioId,
      payload: { puestoId, mesasAsignadas },
    });

    return { puestoId, mesasAsignadas };
  }
}
