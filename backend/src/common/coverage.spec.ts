import { calcularCobertura } from './coverage.js';

describe('calcularCobertura', () => {
  it('returns zeros when mesasTotales is 0', () => {
    expect(calcularCobertura(5, 0)).toEqual({
      coberturaPct: 0,
      mesasSinAsignar: 0,
      mesasExcedentes: 0,
      testigosExcedentes: 0,
    });
  });

  it('partial coverage — 5 testigos, 20 mesas → 50%', () => {
    // 5 × 2 = 10 capacity; 10/20 = 50%
    expect(calcularCobertura(5, 20)).toEqual({
      coberturaPct: 50,
      mesasSinAsignar: 10,
      mesasExcedentes: 0,
      testigosExcedentes: 0,
    });
  });

  it('exact coverage — 10 testigos, 20 mesas → 100%', () => {
    // 10 × 2 = 20 capacity; 20/20 = 100%
    expect(calcularCobertura(10, 20)).toEqual({
      coberturaPct: 100,
      mesasSinAsignar: 0,
      mesasExcedentes: 0,
      testigosExcedentes: 0,
    });
  });

  it('over coverage — 15 testigos, 20 mesas → 150% (no cap)', () => {
    // 15 × 2 = 30 capacity; 30/20 = 150%; excedentes = 30-20=10 mesas, 5 testigos
    expect(calcularCobertura(15, 20)).toEqual({
      coberturaPct: 150,
      mesasSinAsignar: 0,
      mesasExcedentes: 10,
      testigosExcedentes: 5,
    });
  });

  it('real LA ESTRELLA case — floors correctly', () => {
    // LA ESTRELLA: ~129% expected; verify floor (not round)
    // e.g. 9 testigos, 14 mesas → floor(18/14*100) = floor(128.57) = 128
    expect(calcularCobertura(9, 14).coberturaPct).toBe(128);
    expect(calcularCobertura(9, 14).mesasSinAsignar).toBe(0);
    expect(calcularCobertura(9, 14).mesasExcedentes).toBe(4);
    expect(calcularCobertura(9, 14).testigosExcedentes).toBe(2);
  });
});
