import { useState } from 'react';
import type { ChangeEvent } from 'react';

type FilaImportacion = {
  archivo: string;
  fila: number;
  cliente: string;
  responsable_comercial: string;
  host: string;
  puerto: string;
  nombre: string | null;
  operador: 'Tigo' | 'Claro' | 'Movistar' | null;
  iccid: string | null;
  imei: string;
  marca: string | null;
  modelo: string | null;
  serial: string | null;
  fecha_activacion: string | null;
  fecha_envio: string | null;
  notas: string | null;
};
type Archivo = { nombre: string; cliente: string; responsable: string; filas: FilaImportacion[]; errores: string[] };
type Resumen = { clientes: number; servidores: number; equipos: number; sims: number };
type Validacion = { puede_importar: boolean; errores: { archivo?: string; fila?: number; mensaje: string }[]; resumen: Resumen };

const vacio = (value: string | undefined) => (value ?? '').trim();
const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function contarDelimitadores(line: string, delimiter: string) {
  let count = 0; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i + 1] === '"' && quoted) { i++; continue; }
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === delimiter && !quoted) count++;
  }
  return count;
}

function parsearCSV(text: string) {
  const firstLines = text.split(/\r?\n/).slice(0, 10);
  const commas = firstLines.reduce((sum, line) => sum + contarDelimitadores(line, ','), 0);
  const semicolons = firstLines.reduce((sum, line) => sum + contarDelimitadores(line, ';'), 0);
  const separator = commas >= semicolons ? ',' : ';';
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value); value = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function fechaISO(raw: string): string | null {
  const value = raw.trim(); if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  return null;
}

function tomar(headers: string[], row: string[], aliases: string[]) {
  const index = headers.findIndex((h) => aliases.includes(normalizar(h)));
  return index < 0 ? '' : vacio(row[index]);
}

async function leerArchivo(file: File): Promise<Archivo> {
  const cliente = file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim();
  const rows = parsearCSV((await file.text()).replace(/^\uFEFF/, ''));
  const headerIndex = rows.findIndex((row) => row.some((cell) => ['imei', 'imei1'].includes(normalizar(cell))) && row.some((cell) => ['ip', 'host'].includes(normalizar(cell))));
  if (headerIndex < 0) return { nombre: file.name, cliente, responsable: '', filas: [], errores: ['No encontré los encabezados IP y IMEI. Guarda como CSV UTF-8 la hoja de inventario y vuelve a cargarlo.'] };
  const headers = rows[headerIndex].map(normalizar);
  const filas: FilaImportacion[] = []; const errores: string[] = [];
  let hostPrevio = ''; let puertoPrevio = '';
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const raw = rows[i];
    if (!raw.some((cell) => cell.trim())) continue;
    const host = tomar(headers, raw, ['ip', 'host']) || hostPrevio;
    const puerto = tomar(headers, raw, ['puerto']) || puertoPrevio;
    if (host) hostPrevio = host;
    if (puerto) puertoPrevio = puerto;
    const imei = tomar(headers, raw, ['imei1', 'imei']);
    const fila = i + 1;
    if (!imei) { errores.push(`Fila ${fila}: falta el IMEI; no se importará este registro.`); continue; }
    if (/\d[.,]?\d*[eE][+-]?\d+/.test(imei)) { errores.push(`Fila ${fila}: el IMEI parece estar en notación científica; conviértelo a texto en Excel.`); continue; }
    if (!host || !puerto) { errores.push(`Fila ${fila}: falta IP o puerto del servidor.`); continue; }
    const opRaw = tomar(headers, raw, ['operado', 'operador']).toLocaleLowerCase('es-CO');
    const operador = opRaw ? ({ tigo: 'Tigo', claro: 'Claro', movistar: 'Movistar' } as Record<string, 'Tigo' | 'Claro' | 'Movistar'>)[normalizar(opRaw)] : null;
    if (opRaw && !operador) errores.push(`Fila ${fila}: operador no reconocido (${opRaw}); usa Tigo, Claro o Movistar.`);
    const simRaw = tomar(headers, raw, ['sim', 'iccid']);
    if (imei.length < 5 || imei.length > 40) errores.push(`Fila ${fila}: el IMEI debe tener entre 5 y 40 caracteres.`);
    if (simRaw && (simRaw.length < 5 || simRaw.length > 30)) errores.push(`Fila ${fila}: el ICCID debe tener entre 5 y 30 caracteres.`);
    if (simRaw && /\d[.,]?\d*[eE][+-]?\d+/.test(simRaw)) errores.push(`Fila ${fila}: el ICCID parece estar en notación científica; conviértelo a texto en Excel.`);
    const activacionRaw = tomar(headers, raw, ['fechaactsim', 'fechaactivacion']);
    const envioRaw = tomar(headers, raw, ['fechaenvioterm', 'fechaenvio']);
    const fechaActivacion = fechaISO(activacionRaw); const fechaEnvio = fechaISO(envioRaw);
    if (activacionRaw && !fechaActivacion) errores.push(`Fila ${fila}: la fecha de activación no tiene formato reconocible.`);
    if (envioRaw && !fechaEnvio) errores.push(`Fila ${fila}: la fecha de envío no tiene formato reconocible.`);
    filas.push({
      archivo: file.name, fila, cliente, responsable_comercial: '', host, puerto,
      nombre: tomar(headers, raw, ['nombre']) || null,
      operador: operador ?? null,
      iccid: simRaw || null,
      imei,
      marca: tomar(headers, raw, ['marca']) || null,
      modelo: tomar(headers, raw, ['modelo']) || null,
      serial: tomar(headers, raw, ['serial']) || null,
      fecha_activacion: fechaActivacion,
      fecha_envio: fechaEnvio,
      notas: tomar(headers, raw, ['observaciones', 'notas']) || null,
    });
  }
  if (!filas.length && errores.length === 0) errores.push('No encontré filas de equipos para importar.');
  return { nombre: file.name, cliente, responsable: '', filas, errores };
}

export default function ImportarInventario() {
  const [archivos, setArchivos] = useState<Archivo[]>([]);
  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  async function seleccionar(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const seleccionados = [...(input.files ?? [])];
    setCargando(true); setError(''); setMensaje(''); setValidacion(null);
    try {
      const resultado = await Promise.all(seleccionados.map(leerArchivo));
      for (const archivo of resultado) {
        if (archivo.cliente.length > 160) archivo.errores.push('El nombre del cliente derivado del archivo excede 160 caracteres.');
      }
      setArchivos(resultado);
    } catch { setError('No pude leer uno de los archivos. Guarda una copia como CSV UTF-8 y vuelve a intentarlo.'); }
    finally { setCargando(false); input.value = ''; }
  }

  function cambiarResponsable(index: number, responsable: string) {
    setArchivos((actuales) => actuales.map((archivo, i) => i === index ? { ...archivo, responsable } : archivo));
    setValidacion(null); setMensaje('');
  }

  async function previsualizar() {
    const erroresLocales = archivos.flatMap((archivo) => [
      ...archivo.errores.map((mensaje) => ({ archivo: archivo.nombre, mensaje })),
      ...(!archivo.responsable.trim() ? [{ archivo: archivo.nombre, mensaje: `Asigna un responsable comercial a ${archivo.cliente}.` }] : []),
    ]);
    if (!archivos.length) { setError('Selecciona al menos un archivo CSV.'); return; }
    if (erroresLocales.length) { setError(erroresLocales.map((x) => `${x.archivo}: ${x.mensaje}`).join(' ')); return; }
    const registros = archivos.flatMap((archivo) => archivo.filas.map((fila) => ({ ...fila, responsable_comercial: archivo.responsable.trim() })));
    if (registros.length > 100) { setError('La carga admite hasta 100 radios por vez. Divide los archivos y vuelve a intentarlo.'); return; }
    setCargando(true); setError(''); setMensaje('');
    try {
      const respuesta = await fetch('/api/importar/inventario/previsualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registros }) });
      const cuerpo = await respuesta.json() as Validacion & { detalle?: string; campos_invalidos?: { campo: string; mensaje: string }[] };
      if (!respuesta.ok) throw new Error([cuerpo.detalle, ...(cuerpo.campos_invalidos ?? []).map((x) => `${x.campo}: ${x.mensaje}`)].filter(Boolean).join(' '));
      setValidacion(cuerpo);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo revisar el archivo.'); }
    finally { setCargando(false); }
  }

  async function importar() {
    if (!validacion?.puede_importar) return;
    const registros = archivos.flatMap((archivo) => archivo.filas.map((fila) => ({ ...fila, responsable_comercial: archivo.responsable.trim() })));
    setCargando(true); setError(''); setMensaje('');
    try {
      const respuesta = await fetch('/api/importar/inventario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registros }) });
      const cuerpo = await respuesta.json() as { mensaje?: string; detalle?: string; errores?: { archivo?: string; fila?: number; mensaje: string }[]; resumen?: Resumen };
      if (!respuesta.ok) throw new Error(cuerpo.errores?.map((x) => `${x.archivo ?? ''} fila ${x.fila ?? ''}: ${x.mensaje}`).join(' ') || cuerpo.detalle || 'No se pudo completar la importación.');
      const r = cuerpo.resumen;
      setMensaje(`Importación completada: ${r?.clientes ?? 0} clientes, ${r?.servidores ?? 0} servidores, ${r?.equipos ?? 0} equipos y ${r?.sims ?? 0} SIM.`);
      setArchivos([]); setValidacion(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la importación.'); setValidacion(null); }
    finally { setCargando(false); }
  }

  const filasTotal = archivos.reduce((total, archivo) => total + archivo.filas.length, 0);
  return <section className="bulk-import">
    <div className="page-heading"><div><span className="eyebrow">INVENTARIO</span><h1>Carga masiva</h1><p>Importa clientes, servidores, radios y SIM desde las relaciones de inventario.</p></div></div>
    <div className="import-grid">
      <article className="import-card">
        <h2>1. Prepara los archivos</h2>
        <p>En Excel, abre la hoja del inventario y usa <b>Archivo → Guardar como → CSV UTF-8</b>. Conserva el nombre del archivo: se usará como nombre del cliente.</p>
        <p>La importación lee IP, puerto, alias, operador, SIM, IMEI, marca, modelo, serial, fechas y observaciones. El servidor se identifica por <b>IP + puerto</b>; si cambia el puerto, se crea otro servidor.</p>
        <p><b>Usuario, contraseña y batería se descartan.</b></p>
        <label className="file-picker">Seleccionar CSV<input type="file" accept=".csv,text/csv" multiple onChange={(e) => void seleccionar(e)} /></label>
        <small>Hasta 100 radios por carga. Los archivos se leen en este navegador; solo se envían los campos que se importan.</small>
      </article>
      <article className="import-card">
        <h2>2. Asigna responsable comercial</h2>
        {archivos.length ? archivos.map((archivo, index) => <label className="import-assignee" key={`${archivo.nombre}-${index}`}><span>{archivo.cliente || archivo.nombre}</span><input value={archivo.responsable} onChange={(e) => cambiarResponsable(index, e.target.value)} placeholder="Nombre del responsable" maxLength={160} /></label>) : <p>Al seleccionar archivos, aparecerá un campo por cliente.</p>}
      </article>
    </div>
    {error && <div className="import-message is-error" role="alert">{error}</div>}
    {mensaje && <div className="import-message is-success" role="status">{mensaje}</div>}
    {archivos.length > 0 && <article className="import-card import-preview">
      <h2>3. Revisa la importación</h2>
      <p>{archivos.length} archivo(s), {filasTotal} radio(s). Los nombres repetidos de host y puerto se agrupan como un solo servidor. Las SIM se vinculan a su radio por IMEI.</p>
      {archivos.map((archivo, index) => <div className="import-file-row" key={`${archivo.nombre}-row-${index}`}><b>{archivo.cliente}</b><span>{archivo.filas.length} equipos · {archivo.filas.filter((fila) => fila.iccid).length} SIM</span></div>)}
      <div className="import-table-wrap"><table><thead><tr><th>Archivo / fila</th><th>Cliente</th><th>Radio</th><th>Servidor</th><th>Operador / SIM</th><th>IMEI</th></tr></thead><tbody>{archivos.flatMap((archivo) => archivo.filas).map((fila) => <tr key={`${fila.archivo}-${fila.fila}`}><td>{fila.archivo} · {fila.fila}</td><td>{fila.cliente}</td><td>{[fila.nombre, fila.marca, fila.modelo, fila.serial].filter(Boolean).join(' · ') || '—'}</td><td>{fila.host}:{fila.puerto}</td><td>{[fila.operador, fila.iccid].filter(Boolean).join(' · ') || '—'}</td><td>{fila.imei}</td></tr>)}</tbody></table></div>
      <div className="import-actions"><button className="secondary" onClick={() => void previsualizar()} disabled={cargando}>{cargando ? 'Revisando…' : 'Revisar datos'}</button></div>
      {validacion && <>
        <div className={`import-result ${validacion.puede_importar ? 'is-success' : 'is-error'}`}>
          {validacion.puede_importar ? <><b>Vista previa sin errores.</b><span>{validacion.resumen.clientes} clientes · {validacion.resumen.servidores} servidores · {validacion.resumen.equipos} equipos · {validacion.resumen.sims} SIM</span></> : <><b>Corrige estos problemas antes de importar.</b><ul>{validacion.errores.map((item, index) => <li key={`${item.archivo}-${item.fila}-${index}`}>{item.archivo ? `${item.archivo}, ` : ''}{item.fila ? `fila ${item.fila}: ` : ''}{item.mensaje}</li>)}</ul></>}
        </div>
        {validacion.puede_importar && <div className="import-actions"><button className="primary" onClick={() => void importar()} disabled={cargando}>{cargando ? 'Importando…' : `Importar ${validacion.resumen.equipos} radios`}</button></div>}
      </>}
    </article>}
  </section>;
}
