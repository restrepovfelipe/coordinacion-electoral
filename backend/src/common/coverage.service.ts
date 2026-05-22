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
   * Canonical physical-coverage formula (used for all scopes: puesto → department).
   *
   * coberturaPct = FLOOR(mesasCubiertas / totalMesas * 100)
   *
   * where mesasCubiertas = SUM over puestos of MIN(testigos_in_puesto, puesto.mesas).
   * Each testigo covers exactly one mesa; excess testigos beyond mesas count do NOT raise pct.
   * Callers must pre-aggregate (SUM(MIN(t, m))) before passing mesasCubiertas here.
   */
  computePhysicalCoverage(mesasCubiertas: number, totalMesas: number): number {
    if (totalMesas <= 0) return 0;
    return Math.floor((mesasCubiertas / totalMesas) * 100);
  }

  /**
   * How many mesas a single puesto contributes to physical coverage.
   * Apply this per puesto, then SUM to get mesasCubiertas for any scope.
   */
  cappedMesasCovered(testigos: number, mesas: number): number {
    return Math.min(testigos, mesas);
  }

  /**
   * Policy-based required testigos for a puesto.
   * Used ONLY for computeEstado — not for coberturaPct.
   */
  requiredTestigos(
    mesas: number,
    nivel: string,
    ratioAlta: number,
    ratioMedia: number,
    ratioBaja: number,
  ): number {
    const ratio =
      nivel === 'ALTA'
        ? ratioAlta
        : nivel === 'MEDIA'
          ? ratioMedia
          : ratioBaja;
    return Math.ceil(mesas * ratio);
  }

  computeEstado(
    nivel: string,
    votosTotal: number,
    testigosAsignados: number,
    testigosRequeridos: number,
  ): EstadoPuesto {
    if (testigosAsignados >= testigosRequeridos) return 'CUBIERTO';
    if (votosTotal < 5) return 'BAJO_RIESGO';
    if (nivel === 'ALTA') return 'CRITICO';
    if (nivel === 'MEDIA') return 'ATENCION';
    return 'VIGILAR';
  }
}
