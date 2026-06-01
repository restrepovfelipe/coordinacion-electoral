import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { ConfirmAction } from './dto/confirm-action.dto.js';

// Fields cleared when each step is undone (cascade: undoing step N also clears later steps)
const UNDO_CASCADE: Record<string, ('confirmadoAt' | 'acreditadoAt' | 'enPuestoAt')[]> = {
  'undo-aceptado':   ['confirmadoAt', 'acreditadoAt', 'enPuestoAt'],
  'undo-acreditado': ['acreditadoAt', 'enPuestoAt'],
  'undo-enPuesto':   ['enPuestoAt'],
};

const CONFIRM_FIELD: Record<string, 'confirmadoAt' | 'acreditadoAt' | 'enPuestoAt'> = {
  aceptado:   'confirmadoAt',
  acreditado: 'acreditadoAt',
  enPuesto:   'enPuestoAt',
};

@Injectable()
export class ConfirmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async getByToken(token: string) {
    const testigo = await this.prisma.testigo.findUnique({
      where: { token },
      include: {
        puesto: {
          select: {
            id: true,
            name: true,
            address: true,
            municipio: { select: { name: true } },
          },
        },
      },
    });
    if (!testigo) throw new NotFoundException('Enlace no válido');
    return {
      id:            testigo.id,
      name:          testigo.name,
      mesaInicial:   testigo.mesaInicial,
      mesaFinal:     testigo.mesaFinal,
      puesto: testigo.puesto
        ? {
            name:      testigo.puesto.name,
            address:   testigo.puesto.address,
            municipio: testigo.puesto.municipio?.name ?? '',
          }
        : null,
      confirmadoAt:  testigo.confirmadoAt,
      acreditadoAt:  testigo.acreditadoAt,
      enPuestoAt:    testigo.enPuestoAt,
    };
  }

  async confirm(token: string, action: ConfirmAction) {
    const testigo = await this.prisma.testigo.findUnique({ where: { token } });
    if (!testigo) throw new NotFoundException('Enlace no válido');

    const isUndo = action.startsWith('undo-');

    if (isUndo) {
      // Clear this field and all dependent later fields
      const fields = UNDO_CASCADE[action];
      if (!fields) throw new BadRequestException('Acción inválida');

      const clearData: Record<string, null> = {};
      fields.forEach(f => { clearData[f] = null; });

      await this.prisma.testigo.update({ where: { token }, data: clearData });

      if (testigo.puestoId) {
        await this.realtime.notify({
          type: 'testigo:confirmacion_changed',
          puestoId: testigo.puestoId,
          payload: {
            testigoId: testigo.id,
            action,
            fields,   // array of cleared fields
            undo: true,
          },
        });
      }
      return this.getByToken(token);
    }

    // Normal confirm
    const field = CONFIRM_FIELD[action];
    if (!field) throw new BadRequestException('Acción inválida');

    if (testigo[field]) {
      // Already confirmed — idempotent
      return this.getByToken(token);
    }

    await this.prisma.testigo.update({
      where: { token },
      data: { [field]: new Date() },
    });

    if (testigo.puestoId) {
      await this.realtime.notify({
        type: 'testigo:confirmacion_changed',
        puestoId: testigo.puestoId,
        payload: { testigoId: testigo.id, action, field, undo: false },
      });
    }

    return this.getByToken(token);
  }
}
