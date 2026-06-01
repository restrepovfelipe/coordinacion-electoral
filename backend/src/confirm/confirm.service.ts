import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { ConfirmAction } from './dto/confirm-action.dto.js';

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
      id: testigo.id,
      name: testigo.name,
      mesaInicial: testigo.mesaInicial,
      mesaFinal: testigo.mesaFinal,
      puesto: testigo.puesto
        ? {
            name: testigo.puesto.name,
            address: testigo.puesto.address,
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

    const fieldMap: Record<ConfirmAction, 'confirmadoAt' | 'acreditadoAt' | 'enPuestoAt'> = {
      [ConfirmAction.ACEPTADO]:   'confirmadoAt',
      [ConfirmAction.ACREDITADO]: 'acreditadoAt',
      [ConfirmAction.EN_PUESTO]:  'enPuestoAt',
    };
    const field = fieldMap[action];
    if (!field) throw new BadRequestException('Acción inválida');

    if (testigo[field]) {
      // Already confirmed — idempotent, return current state
      return this.getByToken(token);
    }

    await this.prisma.testigo.update({
      where: { token },
      data: { [field]: new Date() },
    });

    // Notify coordinators via SSE
    if (testigo.puestoId) {
      await this.realtime.notify({
        type: 'testigo:confirmacion_changed',
        puestoId: testigo.puestoId,
        payload: { testigoId: testigo.id, action, field },
      });
    }

    return this.getByToken(token);
  }
}
