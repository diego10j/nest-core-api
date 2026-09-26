import { createHash } from 'crypto';
import { existsSync, promises as fs } from 'fs';
import { join } from 'path';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { FILE_STORAGE_CONSTANTS } from '../sistema/files/constants/files.constants';

import { BdtExtraccionService, DocumentoExtraido } from './bdt-extraccion.service';
import { BDT_CONFIG } from './constants/base-tecnica.constants';
import { ProcesarProductoDto } from './dto/procesar-producto.dto';
import { claveEmpresa, normalizarCas, normalizarTexto, recortar } from './helpers/normalizar.helper';

/** Adjunto del producto (lectura de sis_archivo, solo lectura). */
export interface ArchivoProducto {
  uuid: string;
  nombre: string;
  nombre_disco: string;
  mime: string | null;
  peso: number;
  ruta: string;
  version: string;
}

interface DocumentoExistente {
  ide_bddoc: number;
  uuid_origen_bddoc: string;
  hash_bddoc: string;
  version_extractor_bddoc: number;
  estado_bddoc: string;
  intentos_bddoc: number;
}

interface DetalleArchivo {
  archivo: string;
  carpeta: string;
  estado: 'PROCESADO' | 'SIN_CAMBIOS' | 'OMITIDO' | 'ERROR';
  tipo?: string;
  estado_documento?: string;
  confianza?: number;
  motivos?: string[];
  error?: string;
  ms?: number;
}

interface ContextoCorrida {
  /** null en operaciones que no son una corrida (ej. eliminar una extracción). */
  ideBdrun: number | null;
  ideInarti: number;
  ideEmpr: number;
  login: string;
  forzar: boolean;
  /** Extracción de un archivo desde el diálogo del documento: re-extrae aunque esté APROBADO. */
  individual?: boolean;
  nombreProducto: string;
  existentes: DocumentoExistente[];
  detalle: DetalleArchivo[];
  contadores: {
    procesados: number;
    sinCambios: number;
    omitidos: number;
    revision: number;
    errores: number;
    tokens: number;
  };
}

interface Propiedad {
  ide_bdpro: number;
  clave_bdpro: string;
  sinonimos_bdpro: string[];
}

/**
 * Procesa los adjuntos de un producto y actualiza la base técnica (tablas bdt_*).
 *
 * Lee los adjuntos del producto en SOLO LECTURA (sis_archivo + disco): la base técnica no tiene FK
 * hacia la tabla de archivos, solo guarda el uuid del adjunto como referencia para abrir el PDF.
 * El proceso corre en segundo plano: el endpoint devuelve el ide_bdrun al instante y el
 * frontend consulta el avance en bdt_proceso.
 */
@Injectable()
export class BdtProcesoService {
  private readonly logger = new Logger(BdtProcesoService.name);
  private cachePropiedades: { expira: number; data: Propiedad[] } | null = null;

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly extraccion: BdtExtraccionService,
  ) {}

  // ------------------------------------------------------------------ inicio de corrida

  async iniciarProceso(dto: ProcesarProductoDto & HeaderParamsDto) {
    const producto = await this.getProductoErp(dto.ide_inarti);

    // Doble clic / dos usuarios: si ya hay una corrida en curso reciente, se devuelve esa.
    const enCurso = await this.dataSource.pool.query(
      `SELECT ide_bdrun FROM bdt_proceso
        WHERE ide_inarti = $1 AND ide_empr = $2 AND estado_bdrun = 'EJECUTANDO'
          AND fecha_inicio_bdrun > NOW() - INTERVAL '30 minutes'
        ORDER BY ide_bdrun DESC LIMIT 1`,
      [dto.ide_inarti, dto.ideEmpr],
    );
    if (enCurso.rows.length) {
      return { ide_bdrun: enCurso.rows[0].ide_bdrun, enCurso: true };
    }

    const ins = await this.dataSource.pool.query(
      `INSERT INTO bdt_proceso (origen_bdrun, ide_inarti, forzar_bdrun, ide_empr, usuario_ingre)
       VALUES ('MANUAL_PRODUCTO', $1, $2, $3, $4) RETURNING ide_bdrun`,
      [dto.ide_inarti, dto.forzar === true, dto.ideEmpr, dto.login],
    );
    const ideBdrun: number = ins.rows[0].ide_bdrun;

    // Segundo plano: la respuesta HTTP no espera a la IA (un producto con 10 PDFs tarda minutos).
    setImmediate(() => {
      this.ejecutar(ideBdrun, dto.ide_inarti, dto.ideEmpr, dto.login, dto.forzar === true, producto).catch((err) =>
        this.logger.error(`Corrida ${ideBdrun} falló: ${err?.message}`, err?.stack),
      );
    });

    return { ide_bdrun: ideBdrun, enCurso: false };
  }

  private async ejecutar(
    ideBdrun: number,
    ideInarti: number,
    ideEmpr: number,
    login: string,
    forzar: boolean,
    producto: { nombre: string; codigo: string | null },
  ) {
    const ctx: ContextoCorrida = {
      ideBdrun,
      ideInarti,
      ideEmpr,
      login,
      forzar,
      nombreProducto: producto.nombre,
      existentes: [],
      detalle: [],
      contadores: { procesados: 0, sinCambios: 0, omitidos: 0, revision: 0, errores: 0, tokens: 0 },
    };

    try {
      await this.upsertProductoBase(ideInarti, ideEmpr, producto);
      const archivos = await this.listarArchivosProducto(ideInarti, ideEmpr);
      await this.dataSource.pool.query(`UPDATE bdt_proceso SET total_bdrun = $1 WHERE ide_bdrun = $2`, [
        archivos.length,
        ideBdrun,
      ]);

      const existentes = await this.dataSource.pool.query<DocumentoExistente>(
        `SELECT ide_bddoc, uuid_origen_bddoc, hash_bddoc, version_extractor_bddoc, estado_bddoc, intentos_bddoc
           FROM bdt_documento WHERE ide_inarti = $1 AND ide_empr = $2`,
        [ideInarti, ideEmpr],
      );
      ctx.existentes = existentes.rows;

      const propiedades = await this.getPropiedades();
      await ejecutarConConcurrencia(archivos, BDT_CONFIG.CONCURRENCIA, (archivo) =>
        this.procesarArchivo(ctx, archivo, propiedades),
      );

      await this.aplicarVigencias(ctx, archivos);
      await this.actualizarResumenProducto(ctx, { huella: calcularHuella(archivos) });
      await this.finalizarCorrida(ctx, ctx.contadores.errores ? 'CON_ERRORES' : 'OK');
    } catch (error) {
      this.logger.error(`Corrida ${ideBdrun}: ${error?.message}`, error?.stack);
      ctx.detalle.push({ archivo: '(corrida)', carpeta: '', estado: 'ERROR', error: error?.message });
      await this.finalizarCorrida(ctx, 'FALLIDO').catch(() => undefined);
    }
  }

  // ------------------------------------------------------------------ archivo individual

  private async procesarArchivo(ctx: ContextoCorrida, archivo: ArchivoProducto, propiedades: Propiedad[]) {
    const inicio = Date.now();
    const extension = (archivo.nombre.split('.').pop() || '').toLowerCase();
    const detalle: DetalleArchivo = { archivo: archivo.nombre, carpeta: archivo.ruta, estado: 'PROCESADO' };

    try {
      if (!BDT_CONFIG.EXTENSIONES_SOPORTADAS.includes(extension)) {
        ctx.contadores.omitidos++;
        detalle.estado = 'OMITIDO';
        detalle.error = `Extensión .${extension} no soportada`;
        return;
      }
      if (archivo.peso > BDT_CONFIG.MAX_BYTES_ARCHIVO) {
        ctx.contadores.omitidos++;
        detalle.estado = 'OMITIDO';
        detalle.error = 'Archivo mayor a 25 MB';
        return;
      }

      const ruta = join(FILE_STORAGE_CONSTANTS.BASE_PATH, archivo.nombre_disco);
      if (!existsSync(ruta)) throw new Error('El archivo no existe en el almacenamiento');
      const buffer = await fs.readFile(ruta);
      const hash = createHash('sha256').update(buffer).digest('hex');

      const porHash = ctx.existentes.find((d) => d.hash_bddoc === hash);
      const porUuid = ctx.existentes.find((d) => d.uuid_origen_bddoc === archivo.uuid);

      // El mismo PDF adjunto dos veces en el producto (otra carpeta): se procesa una sola vez.
      if (porHash && porHash.uuid_origen_bddoc !== archivo.uuid && !porUuid) {
        ctx.contadores.sinCambios++;
        detalle.estado = 'SIN_CAMBIOS';
        detalle.error = 'Duplicado de otro adjunto del producto';
        return;
      }

      const existente = porHash ?? porUuid;
      // Un documento APROBADO (automático o por un usuario) no se vuelve a extraer en "Procesar", ni
      // con forzar ni al cambiar la versión del extractor: solo desde "Extraer" en su diálogo.
      const aprobado = existente?.estado_bddoc === 'APROBADO' && !ctx.individual;
      if (existente && existente.hash_bddoc === hash && (aprobado || (!ctx.forzar && this.estaAlDia(existente)))) {
        ctx.contadores.sinCambios++;
        detalle.estado = 'SIN_CAMBIOS';
        detalle.estado_documento = existente.estado_bddoc;
        return;
      }

      const ideBddoc = existente
        ? await this.marcarProcesando(existente.ide_bddoc, archivo, hash)
        : await this.insertarPendiente(ctx, archivo, hash);

      try {
        const extr = await this.extraccion.extraer(
          { buffer, nombre: archivo.nombre, extension, mime: archivo.mime },
          { nombreProductoErp: ctx.nombreProducto, clavesPropiedad: propiedades.map((p) => p.clave_bdpro) },
        );
        const estadoDoc = extr.confianza >= BDT_CONFIG.UMBRAL_APROBACION ? 'APROBADO' : 'REVISION';
        await this.persistir(ctx, ideBddoc, !existente, extr, estadoDoc, propiedades);

        ctx.contadores.procesados++;
        ctx.contadores.tokens += extr.tokensEntrada + extr.tokensSalida;
        if (estadoDoc === 'REVISION') ctx.contadores.revision++;
        Object.assign(detalle, {
          tipo: extr.tipo,
          estado_documento: estadoDoc,
          confianza: extr.confianza,
          motivos: extr.motivosRevision,
        });
      } catch (error) {
        await this.dataSource.pool.query(
          `UPDATE bdt_documento
              SET estado_bddoc = 'ERROR', error_bddoc = $2, intentos_bddoc = intentos_bddoc + 1,
                  fecha_proceso_bddoc = NOW()
            WHERE ide_bddoc = $1`,
          [ideBddoc, recortar(error?.message, 2000)],
        );
        throw error;
      }
    } catch (error) {
      ctx.contadores.errores++;
      detalle.estado = 'ERROR';
      detalle.error = error?.message ?? 'Error desconocido';
      this.logger.warn(`[${ctx.ideBdrun}] ${archivo.nombre}: ${detalle.error}`);
    } finally {
      detalle.ms = Date.now() - inicio;
      ctx.detalle.push(detalle);
      await this.actualizarAvance(ctx).catch(() => undefined);
    }
  }

  private estaAlDia(doc: DocumentoExistente): boolean {
    if (doc.version_extractor_bddoc !== BDT_CONFIG.VERSION_EXTRACTOR) return false;
    if (['APROBADO', 'REVISION', 'RECHAZADO'].includes(doc.estado_bddoc)) return true;
    // ERROR: se reintenta hasta MAX_INTENTOS; después hace falta "forzar".
    return doc.estado_bddoc === 'ERROR' && doc.intentos_bddoc >= BDT_CONFIG.MAX_INTENTOS;
  }

  private async insertarPendiente(ctx: ContextoCorrida, archivo: ArchivoProducto, hash: string): Promise<number> {
    const r = await this.dataSource.pool.query(
      `INSERT INTO bdt_documento
         (ide_inarti, uuid_origen_bddoc, nombre_original_bddoc, ruta_carpeta_bddoc, mime_bddoc, peso_bddoc,
          hash_bddoc, estado_bddoc, ide_empr, usuario_ingre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESANDO', $8, $9)
       ON CONFLICT (ide_empr, ide_inarti, hash_bddoc)
       DO UPDATE SET estado_bddoc = 'PROCESANDO', uuid_origen_bddoc = EXCLUDED.uuid_origen_bddoc
       RETURNING ide_bddoc`,
      [
        ctx.ideInarti,
        archivo.uuid,
        recortar(archivo.nombre, 255),
        recortar(archivo.ruta, 500),
        recortar(archivo.mime, 100),
        archivo.peso,
        hash,
        ctx.ideEmpr,
        ctx.login,
      ],
    );
    return r.rows[0].ide_bddoc;
  }

  private async marcarProcesando(ideBddoc: number, archivo: ArchivoProducto, hash: string): Promise<number> {
    await this.dataSource.pool.query(
      `UPDATE bdt_documento
          SET estado_bddoc = 'PROCESANDO', hash_bddoc = $2, uuid_origen_bddoc = $3,
              nombre_original_bddoc = $4, ruta_carpeta_bddoc = $5, peso_bddoc = $6
        WHERE ide_bddoc = $1`,
      [ideBddoc, hash, archivo.uuid, recortar(archivo.nombre, 255), recortar(archivo.ruta, 500), archivo.peso],
    );
    return ideBddoc;
  }

  // ------------------------------------------------------------------ persistencia (transacción)

  private async persistir(
    ctx: ContextoCorrida,
    ideBddoc: number,
    esNuevo: boolean,
    extr: DocumentoExtraido,
    estadoDoc: string,
    propiedades: Propiedad[],
  ) {
    const client = await this.dataSource.pool.connect();
    try {
      await client.query('BEGIN');
      const d = extr.datos;

      const ideBdfab = await this.upsertCatalogo(client, 'fabricante', ctx, d.fabricante?.nombre, {
        pais: d.fabricante?.pais,
        ciudad: d.fabricante?.ciudad,
        direccion: d.fabricante?.direccion,
        web: d.fabricante?.web,
        email: d.fabricante?.email,
        telefono: d.fabricante?.telefono,
      });
      const ideBdprv = await this.upsertCatalogo(client, 'proveedor', ctx, d.proveedor?.nombre, {
        pais: d.proveedor?.pais,
      });
      const ideBdpfa = await this.upsertProductoFabricante(client, ctx, ideBdfab, ideBdprv, extr);

      const anteriores = esNuevo ? [] : await this.snapshotValores(client, ideBddoc);

      await client.query(`DELETE FROM bdt_valor WHERE ide_bddoc = $1`, [ideBddoc]);
      await client.query(`DELETE FROM bdt_seccion WHERE ide_bddoc = $1`, [ideBddoc]);

      let ideBdlot: number | null = null;
      if (extr.tipo === 'CERTIFICADO_ANALISIS' && d.lote?.numero) {
        const lote = await client.query(
          `INSERT INTO bdt_lote (ide_inarti, ide_bdpfa, ide_bddoc, numero_bdlot, fecha_fabricacion_bdlot,
                                 fecha_analisis_bdlot, fecha_vencimiento_bdlot, cumple_bdlot, pais_origen_bdlot,
                                 presentacion_bdlot, ide_empr, usuario_ingre)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (ide_inarti, COALESCE(ide_bdpfa, 0), UPPER(numero_bdlot))
           DO UPDATE SET ide_bddoc = EXCLUDED.ide_bddoc,
                         fecha_fabricacion_bdlot = EXCLUDED.fecha_fabricacion_bdlot,
                         fecha_analisis_bdlot = EXCLUDED.fecha_analisis_bdlot,
                         fecha_vencimiento_bdlot = EXCLUDED.fecha_vencimiento_bdlot,
                         cumple_bdlot = EXCLUDED.cumple_bdlot,
                         pais_origen_bdlot = EXCLUDED.pais_origen_bdlot,
                         presentacion_bdlot = EXCLUDED.presentacion_bdlot
           RETURNING ide_bdlot`,
          [
            ctx.ideInarti,
            ideBdpfa,
            ideBddoc,
            recortar(d.lote.numero, 80),
            extr.fechas.fabricacion,
            extr.fechas.analisis,
            extr.fechas.vencimiento,
            d.lote.cumple,
            recortar(d.lote.pais_origen || d.pais_origen, 80),
            recortar(d.lote.presentacion || d.presentacion, 150),
            ctx.ideEmpr,
            ctx.login,
          ],
        );
        ideBdlot = lote.rows[0].ide_bdlot;
      }

      await client.query(
        `UPDATE bdt_documento SET
            ide_bdpfa = $2, ide_bdprv = $3, ide_bdlot = $4, tipo_bddoc = $5, tipo_fuente_bddoc = $6,
            paginas_bddoc = $7, idioma_bddoc = $8, metodo_extraccion_bddoc = $9,
            texto_original_bddoc = $10, texto_es_bddoc = $11, markdown_bddoc = $12, datos_bddoc = $13,
            producto_detectado_bddoc = $14, fabricante_detectado_bddoc = $15, proveedor_detectado_bddoc = $16,
            lote_detectado_bddoc = $17, codigo_documento_bddoc = $18,
            fecha_emision_bddoc = $19, fecha_revision_bddoc = $20, fecha_fabricacion_bddoc = $21,
            fecha_analisis_bddoc = $22, fecha_vencimiento_bddoc = $23,
            estado_bddoc = $24, confianza_bddoc = $25, motivos_revision_bddoc = $26, vigente_bddoc = TRUE,
            publico_bddoc = $27, version_extractor_bddoc = $28, modelo_ia_bddoc = $29,
            tokens_entrada_bddoc = $30, tokens_salida_bddoc = $31, intentos_bddoc = intentos_bddoc + 1,
            error_bddoc = NULL, fecha_proceso_bddoc = NOW(),
            usuario_revisa_bddoc = NULL, fecha_revisa_bddoc = NULL,
            usuario_actua = $32, fecha_actua = NOW()
          WHERE ide_bddoc = $1`,
        [
          ideBddoc,
          ideBdpfa,
          ideBdprv,
          ideBdlot,
          extr.tipo,
          extr.tipoFuente,
          extr.paginas,
          extr.idioma,
          extr.metodo,
          extr.textoOriginal,
          extr.textoEs,
          extr.markdown,
          JSON.stringify(extr.datos),
          recortar(d.producto?.nombre || d.producto?.nombre_comercial, 250),
          recortar(d.fabricante?.nombre, 200),
          recortar(d.proveedor?.nombre, 200),
          recortar(d.lote?.numero, 80),
          recortar(d.codigo_documento, 80),
          extr.fechas.emision,
          extr.fechas.revision,
          extr.fechas.fabricacion,
          extr.fechas.analisis,
          extr.fechas.vencimiento,
          estadoDoc,
          extr.confianza,
          extr.motivosRevision,
          // Un COA es información interna de lote: nunca público por defecto.
          extr.tipo === 'FICHA_TECNICA' || extr.tipo === 'HOJA_SEGURIDAD',
          BDT_CONFIG.VERSION_EXTRACTOR,
          extr.modelo,
          extr.tokensEntrada,
          extr.tokensSalida,
          ctx.login,
        ],
      );

      for (const v of extr.valores) {
        await client.query(
          `INSERT INTO bdt_valor (ide_bddoc, ide_inarti, ide_bdpfa, ide_bdlot, ide_bdpro, naturaleza_bdval,
                                  nombre_original_bdval, valor_texto_bdval, operador_bdval, valor_num_bdval,
                                  valor_min_bdval, valor_max_bdval, unidad_bdval, metodo_bdval,
                                  especificacion_bdval, pagina_bdval, publico_bdval)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            ideBddoc,
            ctx.ideInarti,
            ideBdpfa,
            v.naturaleza === 'RESULTADO' ? ideBdlot : null,
            this.resolverPropiedad(propiedades, v.clave, v.nombreOriginal),
            v.naturaleza,
            v.nombreOriginal,
            v.valorTexto,
            v.operador,
            v.valorNum,
            v.valorMin,
            v.valorMax,
            v.unidad,
            v.metodo,
            v.especificacion,
            v.pagina,
            extr.tipo !== 'CERTIFICADO_ANALISIS',
          ],
        );
      }

      for (const s of extr.secciones) {
        await client.query(
          `INSERT INTO bdt_seccion (ide_bddoc, ide_inarti, numero_bdsec, clave_bdsec, titulo_bdsec,
                                    pagina_desde_bdsec, pagina_hasta_bdsec, contenido_bdsec,
                                    contenido_original_bdsec, publico_bdsec)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            ideBddoc,
            ctx.ideInarti,
            s.numero,
            s.clave,
            s.titulo,
            s.paginaDesde,
            s.paginaHasta,
            s.contenidoEs,
            s.contenidoOriginal,
            extr.tipo !== 'CERTIFICADO_ANALISIS',
          ],
        );
      }

      await this.registrarSinonimos(client, ctx, ideBddoc, extr);

      await this.historial(client, ctx, ideBddoc, esNuevo ? 'DOCUMENTO_NUEVO' : 'DOCUMENTO_ACTUALIZADO', {
        descripcion: `${extr.tipo.replace(/_/g, ' ')} · ${estadoDoc} · confianza ${(extr.confianza * 100).toFixed(0)}%`,
        despues: { tipo: extr.tipo, estado: estadoDoc, confianza: extr.confianza, motivos: extr.motivosRevision },
      });
      if (!esNuevo) {
        await this.registrarCambiosValores(client, ctx, ideBddoc, anteriores, extr);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertCatalogo(
    client: PoolClient,
    catalogo: 'fabricante' | 'proveedor',
    ctx: ContextoCorrida,
    nombre: string | null | undefined,
    campos: Record<string, string | null | undefined>,
  ): Promise<number | null> {
    const nombreLimpio = recortar(nombre, 200);
    if (!nombreLimpio) return null;
    const sufijo = catalogo === 'fabricante' ? 'bdfab' : 'bdprv';

    // Misma empresa con otra razón social ("Novachem SRL" / "NOVACHEM SAU"): se reutiliza.
    const clave = claveEmpresa(nombreLimpio);
    if (clave) {
      const existentes = await client.query(
        `SELECT ide_${sufijo} AS id, nombre_${sufijo} AS nombre FROM bdt_${catalogo} WHERE ide_empr = $1`,
        [ctx.ideEmpr],
      );
      const mismo = existentes.rows.find((r) => claveEmpresa(r.nombre) === clave);
      if (mismo) return mismo.id;
    }

    const columnas = Object.keys(campos).map((c) => `${c}_${sufijo}`);
    const valores = Object.values(campos).map((v) => recortar(v, 200));
    const params = [nombreLimpio, ...valores, ctx.ideEmpr, ctx.login];
    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
    // Solo completa datos vacíos: lo que un usuario corrigió a mano no se sobrescribe.
    const updates = columnas.map((c) => `${c} = COALESCE(bdt_${catalogo}.${c}, EXCLUDED.${c})`).join(', ');

    const r = await client.query(
      `INSERT INTO bdt_${catalogo} (nombre_${sufijo}, ${columnas.join(', ')}, ide_empr, usuario_ingre)
       VALUES (${placeholders})
       ON CONFLICT (ide_empr, nombre_norm_${sufijo}) DO UPDATE SET ${updates}, fecha_actua = NOW()
       RETURNING ide_${sufijo} AS id`,
      params,
    );
    return r.rows[0].id;
  }

  private async upsertProductoFabricante(
    client: PoolClient,
    ctx: ContextoCorrida,
    ideBdfab: number | null,
    ideBdprv: number | null,
    extr: DocumentoExtraido,
  ): Promise<number> {
    const d = extr.datos;
    const cas = normalizarCas(d.producto?.cas);
    const r = await client.query(
      `INSERT INTO bdt_producto_fabricante (ide_inarti, ide_bdfab, ide_bdprv, nombre_comercial_bdpfa, grado_bdpfa,
                                            cas_bdpfa, pais_origen_bdpfa, ide_empr, usuario_ingre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (ide_inarti, COALESCE(ide_bdfab, 0), COALESCE(UPPER(grado_bdpfa), ''))
       DO UPDATE SET ide_bdprv = COALESCE(bdt_producto_fabricante.ide_bdprv, EXCLUDED.ide_bdprv),
                     nombre_comercial_bdpfa = COALESCE(bdt_producto_fabricante.nombre_comercial_bdpfa, EXCLUDED.nombre_comercial_bdpfa),
                     cas_bdpfa = COALESCE(bdt_producto_fabricante.cas_bdpfa, EXCLUDED.cas_bdpfa),
                     pais_origen_bdpfa = COALESCE(bdt_producto_fabricante.pais_origen_bdpfa, EXCLUDED.pais_origen_bdpfa),
                     fecha_actua = NOW()
       RETURNING ide_bdpfa`,
      [
        ctx.ideInarti,
        ideBdfab,
        ideBdprv,
        recortar(d.producto?.nombre_comercial || d.producto?.nombre, 250),
        recortar(d.producto?.grado, 80),
        cas,
        recortar(d.lote?.pais_origen || d.pais_origen, 80),
        ctx.ideEmpr,
        ctx.login,
      ],
    );
    return r.rows[0].ide_bdpfa;
  }

  private resolverPropiedad(propiedades: Propiedad[], clave: string | null, nombreOriginal: string): number | null {
    if (clave) {
      const p = propiedades.find((x) => x.clave_bdpro === clave);
      if (p) return p.ide_bdpro;
    }
    // Respaldo: el nombre original coincide con un sinónimo del diccionario ("ASSAY", "MOISTURE"…).
    const nombre = normalizarTexto(nombreOriginal).replace(/\s*\(.*\)\s*/g, '').trim();
    const p = propiedades.find((x) => x.clave_bdpro === nombre || (x.sinonimos_bdpro ?? []).includes(nombre));
    return p?.ide_bdpro ?? null;
  }

  private async registrarSinonimos(client: PoolClient, ctx: ContextoCorrida, ideBddoc: number, extr: DocumentoExtraido) {
    const p = extr.datos.producto;
    const candidatos: [string | null | undefined, string][] = [
      [p?.nombre, 'COMERCIAL'],
      [p?.nombre_comercial, 'COMERCIAL'],
      [p?.inci, 'INCI'],
      ...(p?.sinonimos ?? []).map((s) => [s, extr.idioma === 'en' ? 'NOMBRE_EN' : 'COMERCIAL'] as [string, string]),
    ];
    const nombreErp = normalizarTexto(ctx.nombreProducto);
    const vistos = new Set<string>();
    for (const [valor, tipo] of candidatos) {
      const s = recortar(valor, 250);
      if (!s || s.length < 3) continue;
      const norm = normalizarTexto(s);
      if (norm === nombreErp || vistos.has(norm)) continue;
      vistos.add(norm);
      await client.query(
        `INSERT INTO bdt_sinonimo (ide_inarti, sinonimo_bdsin, tipo_bdsin, origen_bdsin, ide_bddoc, ide_empr, usuario_ingre)
         VALUES ($1, $2, $3, 'DOCUMENTO', $4, $5, $6)
         ON CONFLICT (ide_inarti, sinonimo_norm_bdsin) DO NOTHING`,
        [ctx.ideInarti, s, tipo, ideBddoc, ctx.ideEmpr, ctx.login],
      );
    }
  }

  private async snapshotValores(client: PoolClient, ideBddoc: number) {
    const r = await client.query(
      `SELECT COALESCE(p.clave_bdpro, UPPER(v.nombre_original_bdval)) AS clave, v.naturaleza_bdval AS naturaleza,
              v.nombre_original_bdval AS nombre, v.valor_texto_bdval AS valor
         FROM bdt_valor v LEFT JOIN bdt_propiedad p ON p.ide_bdpro = v.ide_bdpro
        WHERE v.ide_bddoc = $1`,
      [ideBddoc],
    );
    return r.rows as { clave: string; naturaleza: string; nombre: string; valor: string | null }[];
  }

  private async registrarCambiosValores(
    client: PoolClient,
    ctx: ContextoCorrida,
    ideBddoc: number,
    anteriores: { clave: string; naturaleza: string; nombre: string; valor: string | null }[],
    extr: DocumentoExtraido,
  ) {
    for (const v of extr.valores) {
      const clave = v.clave || v.nombreOriginal.toUpperCase();
      const previo = anteriores.find((a) => a.clave === clave && a.naturaleza === v.naturaleza);
      if (previo && (previo.valor ?? '') !== (v.valorTexto ?? '')) {
        await this.historial(client, ctx, ideBddoc, 'VALOR_CAMBIADO', {
          descripcion: recortar(`${v.nombreOriginal}: ${previo.valor ?? '—'} → ${v.valorTexto ?? '—'}`, 500),
          antes: previo,
          despues: { clave, naturaleza: v.naturaleza, valor: v.valorTexto },
        });
      }
    }
  }

  // ------------------------------------------------------------------ vigencia y resumen

  /**
   * - Adjuntos que ya no están en el producto → vigente = FALSE (DOCUMENTO_RETIRADO). No se borran.
   * - Por cada tipo FT/SDS y origen (producto+fabricante) solo el más reciente queda vigente
   *   (DOCUMENTO_REEMPLAZADO). Los COA son historial: todos siguen vigentes mientras estén adjuntos.
   */
  private async aplicarVigencias(ctx: ContextoCorrida, archivos: ArchivoProducto[]) {
    const uuids = archivos.map((a) => a.uuid);
    const client = await this.dataSource.pool.connect();
    try {
      await client.query('BEGIN');
      const retirados = await client.query(
        `UPDATE bdt_documento SET vigente_bddoc = FALSE, fecha_actua = NOW()
          WHERE ide_inarti = $1 AND ide_empr = $2 AND vigente_bddoc AND NOT (uuid_origen_bddoc = ANY($3::uuid[]))
          RETURNING ide_bddoc, nombre_original_bddoc`,
        [ctx.ideInarti, ctx.ideEmpr, uuids],
      );
      for (const r of retirados.rows) {
        await this.historial(client, ctx, r.ide_bddoc, 'DOCUMENTO_RETIRADO', {
          descripcion: recortar(`${r.nombre_original_bddoc} ya no está adjunto al producto`, 500),
        });
      }

      const cambios = await client.query(
        `WITH ranking AS (
            SELECT ide_bddoc,
                   ROW_NUMBER() OVER (PARTITION BY tipo_bddoc, COALESCE(ide_bdpfa, 0)
                                      ORDER BY fecha_referencia_bddoc DESC NULLS LAST, ide_bddoc DESC) AS rn
              FROM bdt_documento
             WHERE ide_inarti = $1 AND ide_empr = $2
               AND tipo_bddoc IN ('FICHA_TECNICA', 'HOJA_SEGURIDAD')
               AND estado_bddoc IN ('APROBADO', 'REVISION')
               AND uuid_origen_bddoc = ANY($3::uuid[]))
         UPDATE bdt_documento d SET vigente_bddoc = (r.rn = 1)
           FROM ranking r
          WHERE d.ide_bddoc = r.ide_bddoc AND d.vigente_bddoc IS DISTINCT FROM (r.rn = 1)
          RETURNING d.ide_bddoc, d.vigente_bddoc, d.nombre_original_bddoc`,
        [ctx.ideInarti, ctx.ideEmpr, uuids],
      );
      for (const r of cambios.rows.filter((x) => !x.vigente_bddoc)) {
        await this.historial(client, ctx, r.ide_bddoc, 'DOCUMENTO_REEMPLAZADO', {
          descripcion: recortar(`${r.nombre_original_bddoc} reemplazado por un documento más reciente`, 500),
        });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Recalcula bdt_producto desde los documentos (no solo desde la corrida: una re-extracción
   * individual no debe dejar "ACTUALIZADO" un producto que tiene otros documentos a revisar).
   * - huella: undefined = no tocarla; null = invalidarla (fuerza el aviso "hay archivos sin procesar").
   * - registrarProceso: false para operaciones que no son una lectura (ej. eliminar una extracción).
   */
  private async actualizarResumenProducto(
    ctx: ContextoCorrida,
    opciones: { huella?: string | null; registrarProceso?: boolean } = {},
  ) {
    const registrarProceso = opciones.registrarProceso ?? true;
    const huboCambios = ctx.contadores.procesados > 0 || ctx.detalle.some((d) => d.estado === 'ERROR') || !registrarProceso;

    await this.dataSource.pool.query(
      `WITH t AS (
          SELECT COUNT(*) FILTER (WHERE vigente_bddoc AND estado_bddoc IN ('APROBADO', 'REVISION')) AS total,
                 COUNT(*) FILTER (WHERE vigente_bddoc AND estado_bddoc IN ('APROBADO', 'REVISION') AND tipo_bddoc = 'FICHA_TECNICA') AS ft,
                 COUNT(*) FILTER (WHERE vigente_bddoc AND estado_bddoc IN ('APROBADO', 'REVISION') AND tipo_bddoc = 'CERTIFICADO_ANALISIS') AS coa,
                 COUNT(*) FILTER (WHERE vigente_bddoc AND estado_bddoc IN ('APROBADO', 'REVISION') AND tipo_bddoc = 'HOJA_SEGURIDAD') AS sds,
                 COUNT(*) FILTER (WHERE vigente_bddoc AND estado_bddoc = 'REVISION') AS revision,
                 COUNT(*) FILTER (WHERE vigente_bddoc AND estado_bddoc = 'ERROR') AS errores,
                 MAX(COALESCE(fecha_analisis_bddoc, fecha_fabricacion_bddoc)) FILTER (WHERE vigente_bddoc AND tipo_bddoc = 'CERTIFICADO_ANALISIS') AS ultimo_coa,
                 MAX(COALESCE(fecha_revision_bddoc, fecha_emision_bddoc)) FILTER (WHERE vigente_bddoc AND tipo_bddoc = 'HOJA_SEGURIDAD') AS ultima_sds
            FROM bdt_documento WHERE ide_inarti = $1 AND ide_empr = $2),
       v AS (SELECT COUNT(*) AS valores FROM bdt_valor v JOIN bdt_documento d ON d.ide_bddoc = v.ide_bddoc
              WHERE v.ide_inarti = $1 AND d.vigente_bddoc AND d.ide_empr = $2)
       UPDATE bdt_producto p SET
            estado_bdprd = CASE WHEN t.errores > 0 THEN 'CON_ERRORES'
                                WHEN t.revision > 0 THEN 'CON_REVISION'
                                WHEN t.total = 0 THEN 'SIN_PROCESAR'
                                ELSE 'ACTUALIZADO' END,
            fecha_ultimo_proceso_bdprd = CASE WHEN $6 THEN NOW() ELSE p.fecha_ultimo_proceso_bdprd END,
            usuario_ultimo_proceso_bdprd = CASE WHEN $6 THEN $3 ELSE p.usuario_ultimo_proceso_bdprd END,
            ide_bdrun = CASE WHEN $6 THEN $4 ELSE p.ide_bdrun END,
            fecha_ultimo_cambio_bdprd = CASE WHEN $5 THEN NOW() ELSE p.fecha_ultimo_cambio_bdprd END,
            huella_archivos_bdprd = CASE WHEN $7 THEN $8 ELSE p.huella_archivos_bdprd END,
            total_documentos_bdprd = t.total, total_ft_bdprd = t.ft, total_coa_bdprd = t.coa,
            total_sds_bdprd = t.sds, total_revision_bdprd = t.revision, total_valores_bdprd = v.valores,
            fecha_ultimo_coa_bdprd = t.ultimo_coa, fecha_ultima_sds_bdprd = t.ultima_sds,
            fecha_actua = NOW()
         FROM t, v
        WHERE p.ide_inarti = $1`,
      [
        ctx.ideInarti,
        ctx.ideEmpr,
        ctx.login,
        ctx.ideBdrun,
        huboCambios,
        registrarProceso,
        opciones.huella !== undefined,
        opciones.huella ?? null,
      ],
    );
  }

  private async upsertProductoBase(ideInarti: number, ideEmpr: number, producto: { nombre: string; codigo: string | null }) {
    await this.dataSource.pool.query(
      `INSERT INTO bdt_producto (ide_inarti, nombre_bdprd, codigo_bdprd, ide_empr)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (ide_inarti) DO UPDATE SET nombre_bdprd = EXCLUDED.nombre_bdprd,
                                              codigo_bdprd = EXCLUDED.codigo_bdprd`,
      [ideInarti, recortar(producto.nombre, 250), recortar(producto.codigo, 50), ideEmpr],
    );
  }

  private async actualizarAvance(ctx: ContextoCorrida) {
    const c = ctx.contadores;
    await this.dataSource.pool.query(
      `UPDATE bdt_proceso SET procesados_bdrun = $2, sin_cambios_bdrun = $3, omitidos_bdrun = $4,
              revision_bdrun = $5, errores_bdrun = $6, tokens_bdrun = $7, detalle_bdrun = $8
        WHERE ide_bdrun = $1`,
      [ctx.ideBdrun, c.procesados, c.sinCambios, c.omitidos, c.revision, c.errores, c.tokens, JSON.stringify(ctx.detalle)],
    );
  }

  private async finalizarCorrida(ctx: ContextoCorrida, estado: string) {
    await this.actualizarAvance(ctx);
    await this.dataSource.pool.query(
      `UPDATE bdt_proceso SET estado_bdrun = $2, fecha_fin_bdrun = NOW() WHERE ide_bdrun = $1`,
      [ctx.ideBdrun, estado],
    );
  }

  private async historial(
    client: PoolClient,
    ctx: ContextoCorrida,
    ideBddoc: number | null,
    accion: string,
    datos: { descripcion?: string | null; antes?: unknown; despues?: unknown },
  ) {
    await client.query(
      `INSERT INTO bdt_historial (ide_inarti, ide_bdrun, ide_bddoc, accion_bdhis, descripcion_bdhis,
                                  antes_bdhis, despues_bdhis, usuario_ingre, ide_empr)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ctx.ideInarti,
        ctx.ideBdrun,
        ideBddoc,
        accion,
        datos.descripcion ?? null,
        datos.antes ? JSON.stringify(datos.antes) : null,
        datos.despues ? JSON.stringify(datos.despues) : null,
        ctx.login,
        ctx.ideEmpr,
      ],
    );
  }

  // ------------------------------------------------------------------ operaciones sobre un documento

  /**
   * Extrae (o vuelve a extraer) UN adjunto, sin recorrer el resto del producto. Síncrono: la
   * respuesta trae el resultado (un documento tarda ~10-30 s). Siempre relee aunque no haya cambiado.
   */
  async procesarArchivoIndividual(dto: { uuid: string } & HeaderParamsDto) {
    const ideInarti = await this.getProductoDeArchivo(dto.uuid, dto.ideEmpr);
    const producto = await this.getProductoErp(ideInarti);
    await this.upsertProductoBase(ideInarti, dto.ideEmpr, producto);

    const archivos = await this.listarArchivosProducto(ideInarti, dto.ideEmpr);
    const archivo = archivos.find((a) => a.uuid === dto.uuid);
    if (!archivo) throw new BadRequestException('El archivo no está en las carpetas del producto o está en la papelera');

    const ins = await this.dataSource.pool.query(
      `INSERT INTO bdt_proceso (origen_bdrun, ide_inarti, forzar_bdrun, total_bdrun, ide_empr, usuario_ingre)
       VALUES ('MANUAL_ARCHIVO', $1, TRUE, 1, $2, $3) RETURNING ide_bdrun`,
      [ideInarti, dto.ideEmpr, dto.login],
    );
    const ctx = await this.crearContexto(ins.rows[0].ide_bdrun, ideInarti, dto.ideEmpr, dto.login, true, producto.nombre);
    ctx.individual = true;

    await this.procesarArchivo(ctx, archivo, await this.getPropiedades());
    await this.aplicarVigencias(ctx, archivos);
    // Sin huella: los demás adjuntos del producto pueden seguir sin procesar.
    await this.actualizarResumenProducto(ctx);
    await this.finalizarCorrida(ctx, ctx.contadores.errores ? 'CON_ERRORES' : 'OK');

    const doc = await this.dataSource.pool.query(
      `SELECT ide_bddoc, estado_bddoc, tipo_bddoc FROM bdt_documento
        WHERE uuid_origen_bddoc = $1::uuid AND ide_empr = $2 ORDER BY fecha_proceso_bddoc DESC NULLS LAST LIMIT 1`,
      [dto.uuid, dto.ideEmpr],
    );
    return { ide_bdrun: ctx.ideBdrun, ...(doc.rows[0] ?? { ide_bddoc: null }), detalle: ctx.detalle[0] ?? null };
  }

  /**
   * Borra la extracción de un documento (valores, secciones, lote que respalda y sinónimos no
   * aprobados). El adjunto original no se toca: se puede volver a extraer cuando se quiera.
   */
  async eliminarExtraccion(dto: { ide_bddoc: number } & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT d.ide_inarti, d.nombre_original_bddoc, d.tipo_bddoc, p.nombre_bdprd
         FROM bdt_documento d LEFT JOIN bdt_producto p ON p.ide_inarti = d.ide_inarti
        WHERE d.ide_bddoc = $1 AND d.ide_empr = $2`,
      [dto.ide_bddoc, dto.ideEmpr],
    );
    if (!r.rows.length) throw new BadRequestException('Documento no encontrado');
    const doc = r.rows[0];
    const ctx = await this.crearContexto(null, doc.ide_inarti, dto.ideEmpr, dto.login, false, doc.nombre_bdprd ?? '');

    const client = await this.dataSource.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM bdt_lote WHERE ide_bddoc = $1`, [dto.ide_bddoc]);
      await client.query(
        `DELETE FROM bdt_sinonimo WHERE ide_bddoc = $1 AND origen_bdsin = 'DOCUMENTO' AND NOT aprobado_bdsin`,
        [dto.ide_bddoc],
      );
      await client.query(`DELETE FROM bdt_documento WHERE ide_bddoc = $1`, [dto.ide_bddoc]);
      await this.historial(client, ctx, null, 'DOCUMENTO_ELIMINADO', {
        descripcion: recortar(`${doc.nombre_original_bddoc}: extracción eliminada de la base técnica`, 500),
        antes: { ide_bddoc: dto.ide_bddoc, tipo: doc.tipo_bddoc },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    // Otro documento del mismo tipo puede volver a quedar vigente; la huella se invalida para que
    // el producto muestre "hay archivos sin procesar".
    const archivos = await this.listarArchivosProducto(doc.ide_inarti, dto.ideEmpr);
    await this.aplicarVigencias(ctx, archivos);
    await this.actualizarResumenProducto(ctx, { huella: null, registrarProceso: false });
    return { message: 'ok' };
  }

  private async crearContexto(
    ideBdrun: number | null,
    ideInarti: number,
    ideEmpr: number,
    login: string,
    forzar: boolean,
    nombreProducto: string,
  ): Promise<ContextoCorrida> {
    const existentes = await this.dataSource.pool.query<DocumentoExistente>(
      `SELECT ide_bddoc, uuid_origen_bddoc, hash_bddoc, version_extractor_bddoc, estado_bddoc, intentos_bddoc
         FROM bdt_documento WHERE ide_inarti = $1 AND ide_empr = $2`,
      [ideInarti, ideEmpr],
    );
    return {
      ideBdrun,
      ideInarti,
      ideEmpr,
      login,
      forzar,
      nombreProducto,
      existentes: existentes.rows,
      detalle: [],
      contadores: { procesados: 0, sinCambios: 0, omitidos: 0, revision: 0, errores: 0, tokens: 0 },
    };
  }

  /** Producto dueño de un adjunto: el del archivo o el de la carpeta ancestro que lo tenga. */
  private async getProductoDeArchivo(uuid: string, ideEmpr: number): Promise<number> {
    const r = await this.dataSource.pool.query(
      `WITH RECURSIVE arriba AS (
          SELECT ide_arch, sis_ide_arch, ide_inarti, 0 AS nivel
            FROM sis_archivo WHERE uuid = $1::uuid AND ide_empr = $2
          UNION ALL
          SELECT p.ide_arch, p.sis_ide_arch, p.ide_inarti, a.nivel + 1
            FROM sis_archivo p JOIN arriba a ON p.ide_arch = a.sis_ide_arch
           WHERE a.ide_inarti IS NULL AND a.nivel < 20
       )
       SELECT ide_inarti FROM arriba WHERE ide_inarti IS NOT NULL ORDER BY nivel LIMIT 1`,
      [uuid, ideEmpr],
    );
    if (!r.rows.length) throw new BadRequestException('El archivo no pertenece a ningún producto');
    return r.rows[0].ide_inarti;
  }

  // ------------------------------------------------------------------ lecturas de apoyo

  async getProductoErp(ideInarti: number): Promise<{ nombre: string; codigo: string | null }> {
    const r = await this.dataSource.pool.query(
      `SELECT nombre_inarti, codigo_inarti FROM inv_articulo WHERE ide_inarti = $1`,
      [ideInarti],
    );
    if (!r.rows.length) throw new BadRequestException(`El producto ${ideInarti} no existe`);
    return { nombre: r.rows[0].nombre_inarti, codigo: r.rows[0].codigo_inarti ?? null };
  }

  /**
   * Adjuntos del producto recorriendo carpetas y subcarpetas (sis_ide_arch), sin papelera.
   * Solo lectura: la base técnica nunca escribe en sis_archivo.
   */
  async listarArchivosProducto(ideInarti: number, ideEmpr: number): Promise<ArchivoProducto[]> {
    const r = await this.dataSource.pool.query(
      `WITH RECURSIVE arbol AS (
          SELECT a.ide_arch, a.carpeta_arch, a.nombre_arch, ''::text AS ruta, 1 AS nivel
            FROM sis_archivo a
           WHERE a.ide_inarti = $1 AND a.ide_empr = $2 AND a.sis_ide_arch IS NULL
             AND COALESCE(a.papelera_arch, FALSE) = FALSE
          UNION ALL
          SELECT h.ide_arch, h.carpeta_arch, h.nombre_arch,
                 CASE WHEN p.ruta = '' THEN p.nombre_arch ELSE p.ruta || '/' || p.nombre_arch END,
                 p.nivel + 1
            FROM sis_archivo h
            JOIN arbol p ON h.sis_ide_arch = p.ide_arch AND p.carpeta_arch = TRUE
           WHERE COALESCE(h.papelera_arch, FALSE) = FALSE AND p.nivel < 20
       )
       SELECT a.uuid::text AS uuid, a.nombre_arch AS nombre, a.nombre2_arch AS nombre_disco,
              a.type_arch AS mime, COALESCE(a.peso_arch, 0)::bigint AS peso, t.ruta,
              CONCAT_WS(' ', a.fecha_actua, a.hora_actua, a.fecha_ingre, a.hora_ingre) AS version
         FROM arbol t
         JOIN sis_archivo a ON a.ide_arch = t.ide_arch
        WHERE COALESCE(t.carpeta_arch, FALSE) = FALSE AND a.nombre2_arch IS NOT NULL
        ORDER BY t.ruta, a.nombre_arch`,
      [ideInarti, ideEmpr],
    );
    return r.rows.map((x) => ({ ...x, peso: Number(x.peso) }));
  }

  async getPropiedades(): Promise<Propiedad[]> {
    if (this.cachePropiedades && this.cachePropiedades.expira > Date.now()) return this.cachePropiedades.data;
    const r = await this.dataSource.pool.query<Propiedad>(
      `SELECT ide_bdpro, clave_bdpro, sinonimos_bdpro FROM bdt_propiedad WHERE activo_bdpro ORDER BY clave_bdpro`,
    );
    this.cachePropiedades = { expira: Date.now() + 10 * 60 * 1000, data: r.rows };
    return r.rows;
  }
}

/** Huella de los adjuntos soportados: cambia si se agrega, quita o modifica alguno. */
export function calcularHuella(archivos: ArchivoProducto[]): string {
  const base = archivos
    .filter((a) => BDT_CONFIG.EXTENSIONES_SOPORTADAS.includes((a.nombre.split('.').pop() || '').toLowerCase()))
    .map((a) => `${a.uuid}:${a.peso}:${a.version}`)
    .sort()
    .join('|');
  return createHash('sha256').update(base).digest('hex');
}

async function ejecutarConConcurrencia<T>(items: T[], limite: number, fn: (item: T) => Promise<void>) {
  let indice = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (indice < items.length) {
      const item = items[indice++];
      await fn(item);
    }
  });
  await Promise.all(trabajadores);
}
