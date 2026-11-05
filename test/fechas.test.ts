import { describe, expect, it } from 'vitest';
import { baseRenovacion, estadoLicencia, hoyEnBogota, sumarMesesCalendario } from '../src/worker/fechas';

describe('fechas de licencia', () => {
  it('suma meses y ajusta al último día del mes destino', () => {
    expect(sumarMesesCalendario('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMesesCalendario('2024-01-31', 1)).toBe('2024-02-29');
    expect(sumarMesesCalendario('2024-02-29', 12)).toBe('2025-02-28');
  });

  it('clasifica anulada, vencida, próxima y activa', () => {
    expect(estadoLicencia('2026-11-06', true, '2026-11-05')).toBe('Anulada');
    expect(estadoLicencia('2026-11-04', false, '2026-11-05')).toBe('Vencida');
    expect(estadoLicencia('2026-12-05', false, '2026-11-05')).toBe('Por vencer');
    expect(estadoLicencia('2027-01-01', false, '2026-11-05')).toBe('Activa');
  });

  it('renueva sobre el vencimiento vigente o desde hoy si ya venció', () => {
    expect(baseRenovacion('2026-11-06', '2026-11-05')).toBe('2026-11-06');
    expect(baseRenovacion('2026-11-04', '2026-11-05')).toBe('2026-11-05');
  });

  it('resuelve hoy en America/Bogota y rechaza fechas inválidas', () => {
    expect(hoyEnBogota(new Date('2026-11-05T04:30:00Z'))).toBe('2026-11-04');
    expect(() => sumarMesesCalendario('2026-02-30', 1)).toThrow();
  });
});
