import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
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

  /**
   * Generate a PDF summary of the mesa assignment for a puesto.
   * Returns a Node.js Readable stream (pdfkit output).
   */
  async generarPdfPuesto(puestoId: number): Promise<Readable> {
    const puesto = await this.prisma.puesto.findUnique({
      where: { id: puestoId },
      select: { name: true, address: true, mesas: true, municipioId: true },
    });
    if (!puesto) throw new NotFoundException('Puesto not found');

    const testigos = await this.prisma.testigo.findMany({
      where: { puestoId },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, cedula: true, phone: true, mesaInicial: true, mesaFinal: true },
    });

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    doc.fontSize(16).text(`Asignación de Mesas — ${puesto.name}`, { align: 'center' });
    doc.fontSize(10).text(puesto.address, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Total mesas del puesto: ${puesto.mesas}`, { align: 'center' });
    doc.moveDown(1);

    const mesasAsignadas = testigos.reduce((s, t) => {
      if (t.mesaInicial == null) return s;
      return s + ((t.mesaFinal ?? t.mesaInicial) - t.mesaInicial + 1);
    }, 0);

    doc.fontSize(10).text(`Mesas asignadas: ${mesasAsignadas} / ${puesto.mesas}`, { align: 'center' });
    doc.moveDown(1.5);

    // Table header
    const cols = { testigo: 40, nombre: 160, cedula: 100, telefono: 100, mesas: 100 };
    const startX = doc.page.margins.left;
    let y = doc.y;

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('#', startX, y, { width: cols.testigo });
    doc.text('Testigo', startX + cols.testigo, y, { width: cols.nombre });
    doc.text('Cédula', startX + cols.testigo + cols.nombre, y, { width: cols.cedula });
    doc.text('Teléfono', startX + cols.testigo + cols.nombre + cols.cedula, y, { width: cols.telefono });
    doc.text('Mesas', startX + cols.testigo + cols.nombre + cols.cedula + cols.telefono, y, { width: cols.mesas });
    y += 14;
    doc.moveTo(startX, y).lineTo(startX + 500, y).stroke();
    y += 4;

    doc.font('Helvetica').fontSize(9);
    testigos.forEach((t, i) => {
      const mesaRange = t.mesaInicial != null
        ? `${t.mesaInicial}–${t.mesaFinal}`
        : 'Sin asignar';
      doc.text(String(i + 1), startX, y, { width: cols.testigo });
      doc.text(t.name, startX + cols.testigo, y, { width: cols.nombre });
      doc.text(t.cedula ?? '—', startX + cols.testigo + cols.nombre, y, { width: cols.cedula });
      doc.text(t.phone ?? '—', startX + cols.testigo + cols.nombre + cols.cedula, y, { width: cols.telefono });
      doc.text(mesaRange, startX + cols.testigo + cols.nombre + cols.cedula + cols.telefono, y, { width: cols.mesas });
      y += 14;

      if (y > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    });

    doc.end();
    return doc as unknown as Readable;
  }
}
