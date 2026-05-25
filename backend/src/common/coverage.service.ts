import { Injectable } from '@nestjs/common';
import { calcularCobertura, TESTIGOS_PER_MESA_CAPACITY } from './coverage.js';

export type EstadoPuesto =
  | 'CRITICO'
  | 'ATENCION'
  | 'VIGILAR'
  | 'CUBIERTO'
  | 'BAJO_RIESGO';

export { calcularCobertura, TESTIGOS_PER_MESA_CAPACITY };

@Injectable()
export class CoverageService {
  // Amendment A24 — delegates to calcularCobertura (1 mesa per testigo, no cap)
  computePhysicalCoverage(testigosActivos: number, totalMesas: number): number {
    return calcularCobertura(testigosActivos, totalMesas).coberturaPct;
  }

  // Amendment A24 — CUBIERTO when testigosActivos >= totalMesas (1 testigo = 1 mesa)
  computeEstado(
    nivel: string | null,
    votosTotal: number,
    testigosActivos: number,
    totalMesas: number,
  ): EstadoPuesto {
    if (!nivel || votosTotal < 5) return 'BAJO_RIESGO';
    if (testigosActivos * TESTIGOS_PER_MESA_CAPACITY >= totalMesas) return 'CUBIERTO';
    if (nivel === 'ALTA') return 'CRITICO';
    if (nivel === 'MEDIA') return 'ATENCION';
    return 'VIGILAR';
  }
}
