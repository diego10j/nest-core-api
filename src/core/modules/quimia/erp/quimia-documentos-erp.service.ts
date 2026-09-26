import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { Injectable } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ProformasRepService } from 'src/reports/modules/proformas/proformas-rep.service';
import { FacturasRepService } from 'src/reports/modules/ventas/facturas/facturas-rep.service';
import { detectMimeType } from 'src/util/helpers/file-utils';

import { FILE_STORAGE_CONSTANTS } from '../../sistema/files/constants/files.constants';
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

/** Foto de la galería del producto (inv_articulo.fotos_inarti). */
export interface ImagenProductoQuimia {
  /** Nombre del archivo en el almacenamiento (el chat arma la URL con /sistema/files/image). */
  archivo: string;
  producto: string;
}

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
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly facturasRep: FacturasRepService,
    private readonly proformasRep: ProformasRepService,
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
      [ideEmpr, secuencial, establecimiento, punto, ideSucu || null],
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
            [id, ideEmpr, ideSucu || null],
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
    const galeria = listaFotos(f.fotos_inarti);
    const todas = [...new Set([f.foto_inarti, ...galeria].filter((x): x is string => !!x && typeof x === 'string'))];
    const fotos = todas.filter((x) => existsSync(join(FILE_STORAGE_CONSTANTS.BASE_PATH, x))).slice(0, MAX_FOTOS_PRODUCTO);
    return { producto: f.nombre_inarti, fotos };
  }

  /** Bytes de una foto del producto (para enviarla por Telegram). */
  leerFoto(archivo: string): { buffer: Buffer; nombre: string; mime: string } | null {
    if (!archivo || archivo.includes('..') || archivo.includes('/')) return null;
    const ruta = join(FILE_STORAGE_CONSTANTS.BASE_PATH, archivo);
    if (!existsSync(ruta)) return null;
    return { buffer: readFileSync(ruta), nombre: archivo, mime: detectMimeType(archivo) || 'image/jpeg' };
  }
}
