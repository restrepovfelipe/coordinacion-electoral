import { Injectable } from '@nestjs/common';

export type EstadoPuesto =
  | 'CRITICO'
  | 'ATENCION'
  | 'VIGILAR'
  | 'CUBIERTO'
  | 'BAJO_RIESGO';

@Injectable()
export class CoverageService {
  /**
   * Canonical physical-coverage formula (Amendment A16).
   *
   * coberturaPct = FLOOR(mesasAsignadas / totalMesas * 100)
   *
   * mesasAsignadas = SUM over testigos of (mesaFinal - mesaInicial + 1) WHERE mesaInicial IS NOT NULL.
   * Callers pre-aggregate mesasAsignadas before passing it here.
   */
  computePhysicalCoverage(mesasAsignadas: number, totalMesas: number): number {
    if (totalMesas <= 0) return 0;
    return Math.floor((mesasAsignadas / totalMesas) * 100);
  }

  /**
   * Estado per puesto (Amendment A16 — assignment-based, no ratio).
   *
   * BAJO_RIESGO  → votosTotal < 5 OR no PuestoPrioridad row
   * CUBIERTO     → mesasAsignadas >= totalMesas
   * CRITICO      → nivel = ALTA  and mesasAsignadas < totalMesas
   * ATENCION     → nivel = MEDIA and mesasAsignadas < totalMesas
   * VIGILAR      → nivel = BAJA  and mesasAsignadas < totalMesas
   */
  computeEstado(
    nivel: string | null,
    votosTotal: number,
    mesasAsignadas: number,
    totalMesas: number,
  ): EstadoPuesto {
    if (!nivel || votosTotal < 5) return 'BAJO_RIESGO';
    if (mesasAsignadas >= totalMesas) return 'CUBIERTO';
    if (nivel === 'ALTA') return 'CRITICO';
    if (nivel === 'MEDIA') return 'ATENCION';
    return 'VIGILAR';
  }
}
