import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { join } from 'path';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { degrees, PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { ArchivoSubidoEmitter } from './archivo-subido.emitter';
import { FILE_STORAGE_CONSTANTS } from './constants/files.constants';

/** Sello en los metadatos del PDF: evita poner la marca dos veces aunque se procese de nuevo. */
const SELLO_PDF = 'DIQUIMEC-MARCA-AGUA';
/** Opacidad del logo: casi transparente, no afecta la lectura. */
const OPACIDAD = 0.08;
/** Ancho del logo respecto al ancho visible de la página / imagen. */
const ANCHO_RELATIVO = 0.5;

const EXT_PDF = ['pdf'];
const EXT_IMAGEN = ['jpg', 'jpeg', 'png', 'webp'];

export type ResultadoMarcaAgua =
  | { aplicada: true; uuid: string; hashAnterior: string; hashNuevo: string; peso: number }
  | { aplicada: false; uuid: string; motivo: string };

/** Tamaño y versión del archivo como los usa la huella de adjuntos de la base técnica. */
const VERSION_SQL = `COALESCE(a.peso_arch, 0)::bigint AS peso, CONCAT_WS(' ', a.fecha_actua, a.hora_actua, a.fecha_ingre, a.hora_ingre) AS version`;
const estadoAnterior = (arch: { peso?: unknown; version?: unknown }) => ({
  pesoAnterior: Number(arch.peso ?? 0),
  versionAnterior: String(arch.version ?? ''),
});

/** Extensión en minúsculas de un nombre de archivo. */
const extension = (nombre: string) => (nombre.split('.').pop() ?? '').toLowerCase();

/** ¿Se le puede poner marca de agua a este archivo? (PDF o imagen). */
export function admiteMarcaAgua(nombre: string): boolean {
  const ext = extension(nombre);
  return EXT_PDF.includes(ext) || EXT_IMAGEN.includes(ext);
}

/**
 * Marca de agua con el logo de la empresa (sis_empresa.logotipo_empr, PNG con fondo transparente):
 * centrado en cada página, ~50% del ancho y 8% de opacidad. Reemplaza el archivo en el almacenamiento
 * con el mismo nombre (una sola versión).
 *
 * - PDF (pdf-lib): el logo va como imagen, no como texto, para no ensuciar la extracción de texto; se
 *   respeta la rotación y el recorte de cada página. Queda un sello en los metadatos.
 * - Imagen (sharp): el logo se compone encima; la imagen se guarda en su mismo formato.
 * - Escritura segura: se genera en un temporal, se valida y recién entonces reemplaza al original.
 * - Queda registrado en sis_archivo.marca_agua_arch y se avisa con ArchivoSubidoEmitter (accion
 *   MARCA_AGUA) para que la base técnica actualice el hash del documento y no lo vuelva a extraer.
 */
@Injectable()
export class MarcaAguaService {
  private readonly logger = new Logger(MarcaAguaService.name);
  /** Archivos en proceso: dos pedidos a la vez no escriben el mismo archivo. */
  private readonly enProceso = new Set<string>();

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly archivoEventos: ArchivoSubidoEmitter,
  ) {}

  /**
   * Pone la marca de agua al archivo (sis_archivo.uuid) y lo reemplaza. No lanza error por casos
   * esperados (ya tiene marca, formato no soportado, PDF protegido, sin logo): devuelve el motivo.
   */
  async aplicarAArchivo(uuid: string, ideEmpr: number, login = 'SISTEMA'): Promise<ResultadoMarcaAgua> {
    const r = await this.dataSource.pool.query(
      `SELECT nombre_arch, nombre2_arch, carpeta_arch, to_jsonb(a) ->> 'marca_agua_arch' AS marca_agua, ${VERSION_SQL}
         FROM sis_archivo a WHERE uuid = $1::uuid AND ide_empr = $2`,
      [uuid, ideEmpr],
    );
    const arch = r.rows[0];
    if (!arch || arch.carpeta_arch) throw new BadRequestException('El archivo no existe');
    if (arch.marca_agua) return { aplicada: false, uuid, motivo: 'El archivo ya tiene marca de agua' };
    const ext = extension(arch.nombre2_arch ?? arch.nombre_arch ?? '');
    if (!EXT_PDF.includes(ext) && !EXT_IMAGEN.includes(ext)) {
      return { aplicada: false, uuid, motivo: 'Solo se puede poner marca de agua a PDF o imágenes (JPG, PNG, WEBP)' };
    }
    const ruta = join(FILE_STORAGE_CONSTANTS.BASE_PATH, arch.nombre2_arch);
    if (!existsSync(ruta)) throw new BadRequestException(`El archivo ${arch.nombre_arch} no existe en el almacenamiento`);
    if (this.enProceso.has(uuid)) return { aplicada: false, uuid, motivo: 'El archivo ya se está procesando' };

    this.enProceso.add(uuid);
    try {
      const logo = await this.logoEmpresa(ideEmpr);
      if (!logo) return { aplicada: false, uuid, motivo: 'La empresa no tiene logo configurado (sis_empresa.logotipo_empr)' };

      const original = await readFile(ruta);
      const salida = EXT_PDF.includes(ext) ? await this.marcarPdf(original, logo) : await this.marcarImagen(original, logo, ext);
      if (!salida) {
        // PDF que ya traía el sello (p. ej. copiado de otro producto): solo se registra.
        await this.registrar(uuid, ideEmpr, login, original.length);
        return { aplicada: false, uuid, motivo: 'El archivo ya tiene marca de agua' };
      }

      // Escritura segura: temporal en la misma carpeta y rename (atómico) sobre el original.
      const temporal = `${ruta}.marca-${process.pid}-${Date.now()}.tmp`;
      await writeFile(temporal, salida);
      try {
        if (EXT_PDF.includes(ext)) await PDFDocument.load(await readFile(temporal), { updateMetadata: false });
        else await sharp(temporal).metadata();
        await rename(temporal, ruta);
      } catch (error) {
        await unlink(temporal).catch(() => undefined);
        throw error;
      }

      const hashAnterior = createHash('sha256').update(original).digest('hex');
      const hashNuevo = createHash('sha256').update(salida).digest('hex');
      await this.registrar(uuid, ideEmpr, login, salida.length);
      if (EXT_IMAGEN.includes(ext)) await this.borrarMiniaturas(arch.nombre2_arch);
      // Un archivo compartido entre productos es el mismo en disco: cada producto actualiza su hash.
      for (const u of await this.uuidsDelGrupo(uuid, ideEmpr)) {
        this.archivoEventos.emitir({ uuid: u, ideEmpr, accion: 'MARCA_AGUA', hashAnterior, hashNuevo, ...estadoAnterior(arch) });
      }
      this.logger.log(`Marca de agua: ${arch.nombre_arch} (${uuid})`);
      return { aplicada: true, uuid, hashAnterior, hashNuevo, peso: salida.length };
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      if (/encrypt/i.test(msg)) return { aplicada: false, uuid, motivo: 'El PDF está protegido con contraseña y no se puede modificar' };
      this.logger.warn(`Marca de agua ${arch.nombre_arch} (${uuid}): ${msg}`);
      throw new BadRequestException(`No se pudo poner la marca de agua: ${msg}`);
    } finally {
      this.enProceso.delete(uuid);
    }
  }

  /**
   * Reemplaza el contenido del archivo por otro (ej. el mismo documento escaneado de nuevo o editado por
   * fuera) conservando su nombre, carpeta y uuid: lo que ya se extrajo en la base técnica se mantiene y
   * no se vuelve a extraer. Debe ser del mismo tipo (PDF por PDF, imagen por imagen del mismo formato).
   * El archivo nuevo queda sin marca de agua registrada (salvo que el PDF ya traiga el sello).
   */
  async reemplazarContenido(uuid: string, ideEmpr: number, nuevo: Buffer, nombreSubido: string, login = 'SISTEMA') {
    const r = await this.dataSource.pool.query(
      `SELECT nombre_arch, nombre2_arch, carpeta_arch, ${VERSION_SQL} FROM sis_archivo a WHERE uuid = $1::uuid AND ide_empr = $2`,
      [uuid, ideEmpr],
    );
    const arch = r.rows[0];
    if (!arch || arch.carpeta_arch) throw new BadRequestException('El archivo no existe');
    if (!nuevo?.length) throw new BadRequestException('No se recibió el archivo nuevo');
    const ext = extension(arch.nombre2_arch ?? arch.nombre_arch ?? '');
    const extNuevo = extension(nombreSubido ?? '');
    const mismoTipo = ext === extNuevo || (['jpg', 'jpeg'].includes(ext) && ['jpg', 'jpeg'].includes(extNuevo));
    if (!mismoTipo) throw new BadRequestException(`El archivo nuevo debe ser .${ext} como el actual`);
    const ruta = join(FILE_STORAGE_CONSTANTS.BASE_PATH, arch.nombre2_arch);
    if (this.enProceso.has(uuid)) throw new BadRequestException('El archivo se está procesando, intenta en un momento');

    this.enProceso.add(uuid);
    try {
      // Se valida que el archivo nuevo abra antes de tocar el actual.
      let traeSello = false;
      if (EXT_PDF.includes(ext)) {
        const pdf = await PDFDocument.load(nuevo, { updateMetadata: false }).catch((e) => {
          throw new BadRequestException(`El PDF nuevo no se puede abrir: ${(e as Error).message}`);
        });
        traeSello = (pdf.getKeywords() ?? '').includes(SELLO_PDF);
      } else if (EXT_IMAGEN.includes(ext)) {
        await sharp(nuevo).metadata().catch(() => {
          throw new BadRequestException('La imagen nueva no es válida');
        });
      }
      const anterior = existsSync(ruta) ? await readFile(ruta) : Buffer.alloc(0);
      const temporal = `${ruta}.reemplazo-${process.pid}-${Date.now()}.tmp`;
      await writeFile(temporal, nuevo);
      await rename(temporal, ruta).catch(async (e) => {
        await unlink(temporal).catch(() => undefined);
        throw e;
      });

      await this.dataSource.pool.query(
        `UPDATE sis_archivo SET peso_arch = $3, usuario_actua = $4, fecha_actua = NOW(), hora_actua = NOW()
          WHERE ide_empr = $2 AND nombre2_arch = (SELECT nombre2_arch FROM sis_archivo WHERE uuid = $1::uuid)`,
        [uuid, ideEmpr, nuevo.length, login.slice(0, 50)],
      );
      await this.dataSource.pool
        .query(`UPDATE sis_archivo SET marca_agua_arch = ${traeSello ? 'NOW()' : 'NULL'} WHERE ide_empr = $2 AND nombre2_arch = (SELECT nombre2_arch FROM sis_archivo WHERE uuid = $1::uuid)`, [uuid, ideEmpr])
        .catch(() => undefined);
      if (EXT_IMAGEN.includes(ext)) await this.borrarMiniaturas(arch.nombre2_arch);
      const hashAnterior = createHash('sha256').update(anterior).digest('hex');
      const hashNuevo = createHash('sha256').update(nuevo).digest('hex');
      for (const u of await this.uuidsDelGrupo(uuid, ideEmpr)) {
        this.archivoEventos.emitir({ uuid: u, ideEmpr, accion: 'REEMPLAZADO', hashAnterior, hashNuevo, ...estadoAnterior(arch) });
      }
      this.logger.log(`Archivo reemplazado: ${arch.nombre_arch} (${uuid}) por ${nombreSubido}`);
      return { uuid, nombre: arch.nombre_arch, peso: nuevo.length, marcaAgua: traeSello, hashNuevo };
    } finally {
      this.enProceso.delete(uuid);
    }
  }

  /** Registros que comparten el archivo en disco (el propio incluido). */
  private async uuidsDelGrupo(uuid: string, ideEmpr: number): Promise<string[]> {
    const r = await this.dataSource.pool.query(
      `SELECT uuid::text AS uuid FROM sis_archivo
        WHERE ide_empr = $2 AND nombre2_arch = (SELECT nombre2_arch FROM sis_archivo WHERE uuid = $1::uuid)`,
      [uuid, ideEmpr],
    );
    return r.rows.length ? r.rows.map((x) => x.uuid) : [uuid];
  }

  // ------------------------------------------------------------------ PDF

  /** PDF con el logo en cada página, o null si ya tenía el sello. */
  async marcarPdf(buffer: Buffer, logoPng: Buffer): Promise<Buffer | null> {
    const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
    if ((pdf.getKeywords() ?? '').includes(SELLO_PDF)) return null;

    const logo = await pdf.embedPng(logoPng);
    const proporcion = logo.height / logo.width;
    for (const pagina of pdf.getPages()) {
      const caja = pagina.getCropBox();
      const rotacion = (((pagina.getRotation().angle ?? 0) % 360) + 360) % 360;
      // Ancho visible: con la página girada 90°/270° el lado visible horizontal es su alto.
      const anchoVisible = rotacion === 90 || rotacion === 270 ? caja.height : caja.width;
      const altoVisible = rotacion === 90 || rotacion === 270 ? caja.width : caja.height;
      let w = anchoVisible * ANCHO_RELATIVO;
      let h = w * proporcion;
      if (h > altoVisible * 0.6) {
        h = altoVisible * 0.6;
        w = h / proporcion;
      }
      // El visor gira la página "rotacion" grados en sentido horario: se dibuja el logo girado lo mismo
      // en sentido antihorario para que se vea derecho. pdf-lib gira alrededor de la esquina (x, y):
      // se ubica esa esquina para que el centro del logo caiga en el centro de la página.
      const rad = (rotacion * Math.PI) / 180;
      const cx = caja.x + caja.width / 2;
      const cy = caja.y + caja.height / 2;
      const x = cx - ((w / 2) * Math.cos(rad) - (h / 2) * Math.sin(rad));
      const y = cy - ((w / 2) * Math.sin(rad) + (h / 2) * Math.cos(rad));
      pagina.drawImage(logo, { x, y, width: w, height: h, rotate: degrees(rotacion), opacity: OPACIDAD });
    }
    pdf.setKeywords([...(pdf.getKeywords() ?? '').split(/[,;]\s*/).filter(Boolean), SELLO_PDF]);
    return Buffer.from(await pdf.save());
  }

  // ------------------------------------------------------------------ imagen

  /** Imagen con el logo centrado, en su mismo formato. */
  async marcarImagen(buffer: Buffer, logoPng: Buffer, ext: string): Promise<Buffer> {
    // Orientación EXIF aplicada: el logo queda derecho tal como se ve la foto.
    const base = sharp(buffer).rotate();
    const { data: fotoBuf, info } = await base.toBuffer({ resolveWithObject: true });
    const ancho = info.width;
    const alto = info.height;
    let w = Math.round(ancho * ANCHO_RELATIVO);
    const meta = await sharp(logoPng).metadata();
    let h = Math.round(w * ((meta.height ?? 1) / (meta.width ?? 1)));
    if (h > alto * 0.6) {
      h = Math.round(alto * 0.6);
      w = Math.round(h * ((meta.width ?? 1) / (meta.height ?? 1)));
    }
    // Opacidad: se escala el canal alfa del logo.
    const { data, info: li } = await sharp(logoPng).resize(w, h).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * OPACIDAD);
    const logo = await sharp(data, { raw: { width: li.width, height: li.height, channels: 4 } }).png().toBuffer();

    const salida = sharp(fotoBuf).composite([{ input: logo, gravity: 'center' }]);
    if (ext === 'png') return salida.png().toBuffer();
    if (ext === 'webp') return salida.webp({ quality: 90 }).toBuffer();
    return salida.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  }

  // ------------------------------------------------------------------ apoyo

  /** Logo de la empresa como PNG (si se guardó en otro formato se convierte). */
  private async logoEmpresa(ideEmpr: number): Promise<Buffer | null> {
    const r = await this.dataSource.pool.query(`SELECT logotipo_empr FROM sis_empresa WHERE ide_empr = $1`, [ideEmpr]);
    const archivo: string | undefined = r.rows[0]?.logotipo_empr;
    if (!archivo) return null;
    const ruta = join(envs.pathDrive, archivo);
    if (!existsSync(ruta)) {
      this.logger.warn(`Logo de la empresa ${ideEmpr} no encontrado: ${ruta}`);
      return null;
    }
    const buf = await readFile(ruta);
    return extension(archivo) === 'png' ? buf : sharp(buf).png().toBuffer();
  }

  /** Tamaño, fecha y marca en sis_archivo (marca_agua_arch viene de scripts/marca_agua.sql). */
  private async registrar(uuid: string, ideEmpr: number, login: string, peso: number) {
    await this.dataSource.pool.query(
      `UPDATE sis_archivo SET peso_arch = $3, usuario_actua = $4, fecha_actua = NOW(), hora_actua = NOW()
        WHERE ide_empr = $2 AND nombre2_arch = (SELECT nombre2_arch FROM sis_archivo WHERE uuid = $1::uuid)`,
      [uuid, ideEmpr, peso, login.slice(0, 50)],
    );
    await this.dataSource.pool
      .query(`UPDATE sis_archivo SET marca_agua_arch = NOW() WHERE ide_empr = $2 AND nombre2_arch = (SELECT nombre2_arch FROM sis_archivo WHERE uuid = $1::uuid)`, [uuid, ideEmpr])
      .catch((e) => this.logger.warn(`sis_archivo.marca_agua_arch (¿falta scripts/marca_agua.sql?): ${(e as Error).message}`));
  }

  /** Miniaturas generadas de la imagen (cache/w200_<nombre>.<ext>…): se regeneran con la marca. */
  private async borrarMiniaturas(nombreDisco: string) {
    const sinExt = nombreDisco.replace(/\.[^.]+$/, '');
    const archivos = await readdir(FILE_STORAGE_CONSTANTS.CACHE_DIR).catch(() => [] as string[]);
    await Promise.all(
      archivos
        .filter((f) => f.replace(/\.[^.]+$/, '').endsWith(`_${sinExt}`))
        .map((f) => unlink(join(FILE_STORAGE_CONSTANTS.CACHE_DIR, f)).catch(() => undefined)),
    );
  }
}
