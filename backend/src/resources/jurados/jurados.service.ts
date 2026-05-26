import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class JuradosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(municipioId?: number, puestoId?: number, search?: string) {
    const where: Record<string, unknown> = {};

    if (puestoId !== undefined) {
      where['puestoId'] = puestoId;
    } else if (municipioId !== undefined) {
      where['puesto'] = { municipioId };
    }

    if (search) {
      where['OR'] = [
        { nombre:   { contains: search, mode: 'insensitive' } },
        { cedula:   { contains: search, mode: 'insensitive' } },
        { telefono: { contains: search, mode: 'insensitive' } },
        { municipio:{ contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.jurado.findMany({
        where,
        include: {
          puesto: { select: { id: true, name: true, municipioId: true } },
        },
        orderBy: [{ municipio: 'asc' }, { nombre: 'asc' }],
        take: 500,
      }),
      this.prisma.jurado.count({ where }),
    ]);

    return { data, total };
  }

  async findByPuesto(puestoId: number) {
    return this.prisma.jurado.findMany({
      where: { puestoId },
      orderBy: { nombre: 'asc' },
    });
  }

  async stats() {
    const total = await this.prisma.jurado.count();
    const byMunicipio = await this.prisma.jurado.groupBy({
      by: ['municipio'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    return { total, byMunicipio };
  }
}
