import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ProformasRepService } from 'src/reports/modules/proformas/proformas-rep.service';
import { FacturasRepService } from 'src/reports/modules/ventas/facturas/facturas-rep.service';
import { detectMimeType } from 'src/util/helpers/file-utils';

import { FILE_STORAGE_CONSTANTS } from '../../sistema/files/constants/files.constants';
import { FacturasService } from '../../ventas/facturas/facturas.service';
import { UsuarioQuimia } from '../quimia.types';

/** Máximo de fotos del producto que QuimIA envía. */
export const MAX_FOTOS_PRODUCTO = 5;

export type TipoArchivoErp = 'FACTURA' | 'PROFORMA';

/** PDF de un documento del ERP que QuimIA entrega (el chat lo abre; Telegram lo envía como archivo). */
export interface ArchivoErpQuimia {
  tipo: TipoArchivoErp;
  /** ide_cccfa (factura) o ide_cccpr (proforma). */
  id: number;
  numero: string;
  titulo: string;
  detalle: string;
  nombreArchivo: string;
}

/**
 * De dónde es la imagen (cada una vive en su carpeta y el ERP la sirve por su propio endpoint):
 * - PRODUCTO: foto_inarti / fotos_inarti → /sistema/files/image
 * - ENVIO: guía o evidencia de envío (cxc_transporte_factura.path_imagen_guia_cctfa) → ventas/envios
 * - COMPROBANTE: foto del comprobante de cobro (tes_info_comprobante_banco.foto_teincb) → temp_media
 */
export type OrigenImagenQuimia = 'PRODUCTO' | 'ENVIO' | 'COMPROBANTE';

/** Imagen que QuimIA entrega (chat: miniatura con visor; Telegram: foto normal). */
export interface ImagenProductoQuimia {
  /** Nombre del archivo en su almacenamiento. */
  archivo: string;
  /** Título / pie de foto (nombre del producto, "Guía de envío · factura 001-002-1000"…). */
  producto: string;
  /** Sin origen = PRODUCTO (conversaciones guardadas antes de este cambio). */
  origen?: OrigenImagenQuimia;
}

/** Carpeta de cada origen (la misma que usa el endpoint de descarga del ERP). */
const carpetaImagen = (origen: OrigenImagenQuimia = 'PRODUCTO') =>
  origen === 'ENVIO'
    ? join(envs.pathDrive, 'ventas', 'envios')
    : origen === 'COMPROBANTE'
      ? FILE_STORAGE_CONSTANTS.TEMP_DIR
      : FILE_STORAGE_CONSTANTS.BASE_PATH;

/** Ruta en disco de una imagen, o null si no existe o el nombre no es seguro. */
export function rutaImagenQuimia(archivo: string, origen?: OrigenImagenQuimia): string | null {
  const nombre = (archivo ?? '').trim();
  if (!nombre || nombre.includes('..') || nombre.startsWith('/') || /^https?:/i.test(nombre)) return null;
  const ruta = join(carpetaImagen(origen), nombre);
  return existsSync(ruta) ? ruta : null;
}

/** Nombre de archivo de un elemento de la galería: texto, o un objeto con name/url/archivo/path. */
const nombreFoto = (v: unknown): string | null => {
  if (typeof v === 'string') return v.trim() || null;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const x = o.name ?? o.nombre ?? o.archivo ?? o.fileName ?? o.path ?? o.url ?? o.src;
    return typeof x === 'string' && x.trim() ? x.trim() : null;
  }
  return null;
};

export interface DocumentoEncontrado {
  id: number;
  numero: string;
  fecha: string;
  cliente: string;
  total: number;
  estado: string | null;
}

/** fotos_inarti puede llegar como arreglo (json/text[]) o como texto JSON. */
const listaFotos = (v: unknown): string[] => {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
};

const soloDigitos = (s: string) => (s ?? '').replace(/\D/g, '');

/**
 * Documentos del ERP para QuimIA: busca facturas/proformas por número y genera su PDF con los mismos
 * reportes del ERP (Factura → "PDF" de la factura, Proforma → "Ver Proforma"). También lee las fotos
 * de la galería del producto.
 */
@Injectable()
export class QuimiaDocumentosErpService {
  private readonly logger = new Logger(QuimiaDocumentosErpService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly facturasRep: FacturasRepService,
    private readonly proformasRep: ProformasRepService,
    private readonly facturas: FacturasService,
  ) {}

  /**
   * Facturas por número: "1029", "000001029" o "001-002-000001029" (con establecimiento y punto de
   * emisión filtra la serie). Más recientes primero. Solo de la sucursal del usuario: en Telegram es la
   * sucursal configurada en la cuenta (tlg_cuenta.ide_sucu); en el ERP, la sucursal de la sesión.
   */
  async buscarFacturas(numero: string, ideEmpr: number, ideSucu: number | null): Promise<DocumentoEncontrado[]> {
    const partes = String(numero).trim().split(/[-\s]+/).map(soloDigitos).filter(Boolean);
    const secuencial = partes.pop();
    if (!secuencial) return [];
    const [establecimiento, punto] = partes.length >= 2 ? partes.slice(-2) : [null, null];
    const r = await this.dataSource.pool.query(
      `SELECT a.ide_cccfa AS id,
              CONCAT_WS('-', c.establecimiento_ccdfa, c.pto_emision_ccdfa, a.secuencial_cccfa) AS numero,
              TO_CHAR(a.fecha_emisi_cccfa, 'YYYY-MM-DD') AS fecha, b.nom_geper AS cliente, a.total_cccfa AS total,
              e.nombre_ccefa AS estado
         FROM cxc_cabece_factura a
         JOIN cxc_datos_fac c ON c.ide_ccdaf = a.ide_ccdaf
         JOIN gen_persona b ON b.ide_geper = a.ide_geper
         LEFT JOIN cxc_estado_factura e ON e.ide_ccefa = a.ide_ccefa
        WHERE a.ide_empr = $1
          AND ($5::int IS NULL OR a.ide_sucu = $5)
          AND LTRIM(a.secuencial_cccfa::text, '0') = LTRIM($2, '0')
          AND ($3::text IS NULL OR LTRIM(c.establecimiento_ccdfa::text, '0') = LTRIM($3, '0'))
          AND ($4::text IS NULL OR LTRIM(c.pto_emision_ccdfa::text, '0') = LTRIM($4, '0'))
        ORDER BY a.fecha_emisi_cccfa DESC, a.ide_cccfa DESC
        LIMIT 10`,
      // Sin sucursal (cuenta de Telegram sin sucursal configurada) no se filtra.
      [ideEmpr, secuencial, establecimiento, punto, ideSucu ?? null],
    );
    return r.rows.map((x) => ({ ...x, total: Number(x.total) }));
  }

  async buscarProformas(numero: string, ideEmpr: number): Promise<DocumentoEncontrado[]> {
    const secuencial = soloDigitos(String(numero).split(/[-\s]+/).pop() ?? '');
    if (!secuencial) return [];
    const r = await this.dataSource.pool.query(
      `SELECT c.ide_cccpr AS id, c.secuencial_cccpr AS numero, TO_CHAR(c.fecha_cccpr, 'YYYY-MM-DD') AS fecha,
              COALESCE(p.nom_geper, c.solicitante_cccpr) AS cliente, c.total_cccpr AS total,
              CASE WHEN c.anulado_cccpr THEN 'ANULADA' ELSE NULL END AS estado
         FROM cxc_cabece_proforma c
         LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
        WHERE c.ide_empr = $1 AND LTRIM(c.secuencial_cccpr::text, '0') = LTRIM($2, '0')
        ORDER BY c.fecha_cccpr DESC, c.ide_cccpr DESC
        LIMIT 10`,
      [ideEmpr, secuencial],
    );
    return r.rows.map((x) => ({ ...x, total: Number(x.total) }));
  }

  /**
   * Documento elegido con un botón (Telegram): se vuelve a validar que sea de la empresa y, si es
   * factura, de la sucursal.
   */
  async obtenerArchivo(tipo: TipoArchivoErp, id: number, ideEmpr: number, ideSucu: number | null): Promise<ArchivoErpQuimia | null> {
    const r =
      tipo === 'FACTURA'
        ? await this.dataSource.pool.query(
            `SELECT a.ide_cccfa AS id,
                    CONCAT_WS('-', c.establecimiento_ccdfa, c.pto_emision_ccdfa, a.secuencial_cccfa) AS numero,
                    TO_CHAR(a.fecha_emisi_cccfa, 'YYYY-MM-DD') AS fecha, b.nom_geper AS cliente, a.total_cccfa AS total,
                    e.nombre_ccefa AS estado
               FROM cxc_cabece_factura a
               JOIN cxc_datos_fac c ON c.ide_ccdaf = a.ide_ccdaf
               JOIN gen_persona b ON b.ide_geper = a.ide_geper
               LEFT JOIN cxc_estado_factura e ON e.ide_ccefa = a.ide_ccefa
              WHERE a.ide_cccfa = $1 AND a.ide_empr = $2 AND ($3::int IS NULL OR a.ide_sucu = $3)`,
            [id, ideEmpr, ideSucu ?? null],
          )
        : await this.dataSource.pool.query(
            `SELECT c.ide_cccpr AS id, c.secuencial_cccpr AS numero, TO_CHAR(c.fecha_cccpr, 'YYYY-MM-DD') AS fecha,
                    COALESCE(p.nom_geper, c.solicitante_cccpr) AS cliente, c.total_cccpr AS total,
                    CASE WHEN c.anulado_cccpr THEN 'ANULADA' ELSE NULL END AS estado
               FROM cxc_cabece_proforma c
               LEFT JOIN gen_persona p ON p.ide_geper = c.ide_geper
              WHERE c.ide_cccpr = $1 AND c.ide_empr = $2`,
            [id, ideEmpr],
          );
    const d = r.rows[0];
    return d ? this.archivoDe(tipo, { ...d, total: Number(d.total) }) : null;
  }

  archivoDe(tipo: TipoArchivoErp, d: DocumentoEncontrado): ArchivoErpQuimia {
    const etiqueta = tipo === 'FACTURA' ? 'Factura' : 'Proforma';
    return {
      tipo,
      id: d.id,
      numero: d.numero,
      titulo: `${etiqueta} ${d.numero}`,
      detalle: [d.cliente, d.fecha, `$${d.total.toFixed(2)}`, d.estado].filter(Boolean).join(' · '),
      nombreArchivo: `${etiqueta.toLowerCase()}-${String(d.numero).replace(/[^\w-]/g, '')}.pdf`,
    };
  }

  /** PDF con el mismo reporte que usa el ERP. */
  async generarPdf(archivo: Pick<ArchivoErpQuimia, 'tipo' | 'id'>, usuario: UsuarioQuimia): Promise<Buffer> {
    const headers = {
      ideEmpr: usuario.ideEmpr,
      ideSucu: usuario.ideSucu,
      ideUsua: usuario.ideUsua,
      idePerf: usuario.idePerf,
      login: usuario.login,
    } as any;
    if (archivo.tipo === 'PROFORMA') {
      return this.proformasRep.reportProforma({ ...headers, ide_cccpr: archivo.id });
    }
    const doc = await this.facturasRep.reportFacturaElectronica({ ...headers, ide_cccfa: archivo.id });
    // pdfmake devuelve un stream (PDFKit): se junta en memoria.
    return new Promise<Buffer>((resolve, reject) => {
      const partes: Buffer[] = [];
      doc.on('data', (c: Buffer) => partes.push(c));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);
      doc.end();
    });
  }

  /** Fotos de la galería del producto (principal primero), máximo 5, solo las que existen en disco. */
  async fotosProducto(ideInarti: number, ideEmpr: number): Promise<{ producto: string; fotos: string[] }> {
    const r = await this.dataSource.pool.query(
      `SELECT nombre_inarti, foto_inarti, fotos_inarti FROM inv_articulo WHERE ide_inarti = $1 AND ide_empr = $2`,
      [ideInarti, ideEmpr],
    );
    const f = r.rows[0];
    if (!f) return { producto: '', fotos: [] };
    // Misma galería del detalle del producto: foto principal + fotos_inarti (sin repetir). Si la galería
    // está vacía queda la principal.
    const todas = [
      ...new Set([f.foto_inarti, ...listaFotos(f.fotos_inarti)].map(nombreFoto).filter((x): x is string => !!x && x.toUpperCase() !== 'NOIMAGE')),
    ];
    const fotos = todas.filter((x) => rutaImagenQuimia(x, 'PRODUCTO'));
    if (fotos.length < todas.length) {
      this.logger.warn(
        `Producto ${ideInarti}: ${todas.length - fotos.length} foto(s) registradas no están en ${carpetaImagen('PRODUCTO')}: ` +
          todas.filter((x) => !fotos.includes(x)).join(', '),
      );
    }
    return { producto: f.nombre_inarti, fotos: fotos.slice(0, MAX_FOTOS_PRODUCTO) };
  }

  /** Bytes de una imagen (para enviarla por Telegram), desde la carpeta de su origen. */
  leerFoto(archivo: string, origen?: OrigenImagenQuimia): { buffer: Buffer; nombre: string; mime: string } | null {
    const ruta = rutaImagenQuimia(archivo, origen);
    if (!ruta) return null;
    const nombre = archivo.split('/').pop() || archivo;
    return { buffer: readFileSync(ruta), nombre, mime: detectMimeType(nombre) || 'image/jpeg' };
  }

  /**
   * Guía de envío y comprobantes de cobro de una factura, tal como los muestra el detalle de la factura
   * del ERP (FacturasService.getFacturaById): transporte.path_imagen_guia_cctfa y
   * pagos.detalles[].comprobante_foto. Solo los archivos que existen en disco.
   */
  async imagenesFactura(ideCccfa: number, usuario: UsuarioQuimia) {
    const r: any = await this.facturas.getFacturaById({ ...usuario, ide_cccfa: ideCccfa } as any);
    const f = r?.row ?? {};
    const t = f.transporte ?? null;
    const guia = t?.path_imagen_guia_cctfa && rutaImagenQuimia(t.path_imagen_guia_cctfa, 'ENVIO') ? String(t.path_imagen_guia_cctfa) : null;
    const pagos = ((f.pagos?.detalles ?? []) as any[]).map((p) => ({
      fecha: p.fecha_trans_ccdtr ? String(p.fecha_trans_ccdtr instanceof Date ? p.fecha_trans_ccdtr.toISOString() : p.fecha_trans_ccdtr).slice(0, 10) : null,
      valor: p.valor_ccdtr != null ? Number(p.valor_ccdtr) : null,
      cuenta: p.cuenta ?? null,
      numero: p.comprobante_numero ?? p.docum_relac_ccdtr ?? null,
      efectivo: !!p.comprobante_es_efectivo,
      foto: p.comprobante_foto && rutaImagenQuimia(p.comprobante_foto, 'COMPROBANTE') ? String(p.comprobante_foto) : null,
      foto_registrada: !!p.comprobante_foto,
    }));
    return {
      transporte: t
        ? {
            tipo: t.es_transporte_propio_cctfa ? 'Transporte propio' : (t.nombre_vgtra ?? t.nombre_transporte ?? 'Retiro en oficina'),
            destinatario: t.destinatario_guia_cctfa ?? null,
            fecha_envio: t.fecha_envio_cctfa ? String(t.fecha_envio_cctfa instanceof Date ? t.fecha_envio_cctfa.toISOString() : t.fecha_envio_cctfa).slice(0, 10) : null,
            guia_registrada: !!t.path_imagen_guia_cctfa,
          }
        : null,
      guia,
      pagos,
      estadoPago: f.pagos?.estado ?? null,
    };
  }
}
