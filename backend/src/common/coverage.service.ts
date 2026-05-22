import { Injectable } from '@nestjs/common';

export type EstadoPuesto =
  | 'CRITICO'
  | 'ATENCION'
  | 'VIGILAR'
  | 'CUBIERTO'
  | 'BAJO_RIESGO';

@Injectable()
export class CoverageService {
  /** Canonical coverage formula used everywhere in the app. */
  computeCoverage(
    testigos: number,
    mesas: number,
    nivel: string,
    ratioAlta: number,
    ratioMedia: number,
    ratioBaja: number,
  ): { required: number; pct: number } {
    const ratio =
      nivel === 'ALTA'
        ? ratioAlta
        : nivel === 'MEDIA'
          ? ratioMedia
          : ratioBaja;
    const required = Math.ceil(mesas * ratio);
    const pct =
      required > 0 ? Math.min(100, Math.round((testigos / required) * 100)) : 100;
    return { required, pct };
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
