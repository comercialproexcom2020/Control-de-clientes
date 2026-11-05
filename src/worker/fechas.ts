export type EstadoLicencia = 'Anulada' | 'Vencida' | 'Por vencer' | 'Activa';

function descomponerFecha(fecha: string): [number, number, number] {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!coincidencia) throw new Error('La fecha debe estar en formato YYYY-MM-DD.');
  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const verificacion = new Date(Date.UTC(anio, mes - 1, dia));
  if (verificacion.getUTCFullYear() !== anio || verificacion.getUTCMonth() !== mes - 1 || verificacion.getUTCDate() !== dia) {
    throw new Error('La fecha no existe en el calendario.');
  }
  return [anio, mes, dia];
}

export function validarFechaISO(fecha: string): boolean {
  try { descomponerFecha(fecha); return true; } catch { return false; }
}

export function validarMeses(meses: number): void {
  if (![1, 3, 6, 12, 24].includes(meses)) throw new Error('La duración debe ser de 1, 3, 6, 12 o 24 meses.');
}

export function sumarMesesCalendario(fecha: string, meses: number): string {
  validarMeses(meses);
  const [anio, mes, dia] = descomponerFecha(fecha);
  const indiceMes = anio * 12 + (mes - 1) + meses;
  const anioDestino = Math.floor(indiceMes / 12);
  const mesDestino = (indiceMes % 12) + 1;
  const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino, 0)).getUTCDate();
  const diaDestino = Math.min(dia, ultimoDia);
  return `${anioDestino.toString().padStart(4, '0')}-${mesDestino.toString().padStart(2, '0')}-${diaDestino.toString().padStart(2, '0')}`;
}

export function sumarDiasCalendario(fecha: string, dias: number): string {
  const [anio, mes, dia] = descomponerFecha(fecha);
  const resultado = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return `${resultado.getUTCFullYear().toString().padStart(4, '0')}-${(resultado.getUTCMonth() + 1).toString().padStart(2, '0')}-${resultado.getUTCDate().toString().padStart(2, '0')}`;
}

export function hoyEnBogota(instante: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instante);
}

export function estadoLicencia(fechaVence: string, anulada: boolean, hoy: string, diasAlerta = 30): EstadoLicencia {
  descomponerFecha(fechaVence);
  descomponerFecha(hoy);
  if (anulada) return 'Anulada';
  if (fechaVence < hoy) return 'Vencida';
  const diasRestantes = (Date.parse(`${fechaVence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000;
  if (diasRestantes <= diasAlerta) return 'Por vencer';
  return 'Activa';
}

export function baseRenovacion(fechaVence: string, hoy: string): string {
  descomponerFecha(fechaVence);
  descomponerFecha(hoy);
  return fechaVence < hoy ? hoy : fechaVence;
}
