// Amendment A24 — Opción A coverage formula (no 100% cap; 2 mesas per testigo)
export const TESTIGOS_PER_MESA_CAPACITY = 2;

export interface CoberturaResult {
  coberturaPct: number;
  mesasSinAsignar: number;
  mesasExcedentes: number;
  testigosExcedentes: number;
}

export function calcularCobertura(
  testigosActivos: number,
  mesasTotales: number,
): CoberturaResult {
  if (mesasTotales <= 0) {
    return { coberturaPct: 0, mesasSinAsignar: 0, mesasExcedentes: 0, testigosExcedentes: 0 };
  }
  const capacidadCubrir = testigosActivos * TESTIGOS_PER_MESA_CAPACITY;
  return {
    coberturaPct: Math.floor((capacidadCubrir / mesasTotales) * 100),
    mesasSinAsignar: Math.max(0, mesasTotales - capacidadCubrir),
    mesasExcedentes: Math.max(0, capacidadCubrir - mesasTotales),
    testigosExcedentes: Math.max(
      0,
      Math.floor((capacidadCubrir - mesasTotales) / TESTIGOS_PER_MESA_CAPACITY),
    ),
  };
}
