import { calcularCobertura } from './coverage.js';

describe('calcularCobertura', () => {
  it('La Estrella: 131 testigos, 202 mesas → 64%, 71 sin asignar', () => {
    const r = calcularCobertura(131, 202);
    expect(r.coberturaPct).toBe(64);
    expect(r.mesasSinAsignar).toBe(71);
    expect(r.mesasExcedentes).toBe(0);
    expect(r.testigosExcedentes).toBe(0);
  });

  it('Medellín: 2326 testigos, 5592 mesas → 41%, 3266 sin asignar', () => {
    const r = calcularCobertura(2326, 5592);
    expect(r.coberturaPct).toBe(41);
    expect(r.mesasSinAsignar).toBe(3266);
  });

  it('Girardota: 158 testigos, 178 mesas → 88%', () => {
    const r = calcularCobertura(158, 178);
    expect(r.coberturaPct).toBe(88);
    expect(r.mesasSinAsignar).toBe(20);
  });

  it('Sobrecobertura: 100 testigos, 50 mesas → 200%, 50 excedentes', () => {
    const r = calcularCobertura(100, 50);
    expect(r.coberturaPct).toBe(200);
    expect(r.mesasExcedentes).toBe(50);
    expect(r.testigosExcedentes).toBe(50);
  });

  it('Cero mesas → 0%', () => {
    const r = calcularCobertura(10, 0);
    expect(r.coberturaPct).toBe(0);
  });
});
