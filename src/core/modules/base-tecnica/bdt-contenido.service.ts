import { Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { BdtConsultaService } from './bdt-consulta.service';
import { BdtIaService } from './bdt-ia.service';
import { BdtProcesoService } from './bdt-proceso.service';
import { BDT_CONFIG } from './constants/base-tecnica.constants';
import { GenerarContenidoDto } from './dto/generar-contenido.dto';
import { normalizarTexto } from './helpers/normalizar.helper';
import {
  ContenidoProductoIa,
  SCHEMA_CONTENIDO_PRODUCTO,
  promptContenidoProducto,
} from './prompts/contenido-producto.prompt';

/** Términos para priorizar secciones cuando la documentación no cabe completa en el contexto. */
const TEMAS_CONTENIDO =
  'descripcion aplicaciones usos funciones dosificacion dosis presentacion empaque especificaciones ' +
  'propiedades caracteristicas almacenamiento identificacion composicion description applications uses ' +
  'dosage dosing recommended dose use level packaging specifications properties storage ' +
  'dosificacion recomendada nivel de uso concentracion de uso modo de empleo proporcion';

const MAX_OTROS_NOMBRES = 3;

/** Términos de dosificación (sin tildes) en español e inglés; sirve para Postgres (~*) y JS. */
const PATRON_DOSIFICACION_SQL =
  'dosific|dosis|dosage|dosing|dose|use level|usage level|use rate|addition rate|recommended use|' +
  'suggested use|niveles? de uso|concentracion de uso|modo de empleo|modo de uso|forma de uso|' +
  'como usar|how to use|directions for use|tasa de uso|proporcion de uso|recomendado de uso';
const MAX_FRAGMENTO_DOSIS = 1200;
const MAX_TOTAL_DOSIS = 9000;

/**
 * "Generar Contenido" de Editar Producto: redacta descripción corta, descripción larga (HTML) y otros
 * nombres a partir de la base técnica del producto. Si el producto no tiene documentos técnicos
 * devuelve con_base_tecnica = false y el frontend ofrece generar solo con GPT (/gpt/generateContentProduct).
 */
@Injectable()
export class BdtContenidoService {
  private readonly logger = new Logger(BdtContenidoService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly consulta: BdtConsultaService,
    private readonly proceso: BdtProcesoService,
    private readonly ia: BdtIaService,
  ) {}

  /** complementar = el usuario aceptó que GPT complete lo que los documentos no cubren. */
  async generarContenidoProducto(dto: GenerarContenidoDto & HeaderParamsDto) {
    const producto = await this.proceso.getProductoErp(dto.ide_inarti);
    const { docs, texto } = await this.consulta.construirContexto(
      dto.ide_inarti,
      dto.ideEmpr,
      TEMAS_CONTENIDO,
      producto.nombre,
    );
    if (!docs.length) return { con_base_tecnica: false };

    const sinonimos = await this.sinonimosDocumentos(dto.ide_inarti, dto.ideEmpr, producto.nombre);
    const fragmentosDosis = await this.fragmentosDosificacion(docs);
    const textoIa = fragmentosDosis ? `${texto}\n\n${fragmentosDosis}` : texto;

    const { datos, tokensEntrada, tokensSalida } = await this.ia.completarJson<ContenidoProductoIa>(
      [
        { role: 'system', content: promptContenidoProducto(sinonimos, dto.complementar === true) },
        { role: 'user', content: textoIa },
      ],
      SCHEMA_CONTENIDO_PRODUCTO as unknown as Record<string, unknown>,
      'contenido_producto',
      { modelo: BDT_CONFIG.MODELO_CONTENIDO, temperatura: 0, maxTokens: 3000 },
    );
    this.logger.log(
      `Contenido ide_inarti=${dto.ide_inarti}: ${docs.length} docs, tokens ${tokensEntrada}/${tokensSalida}`,
    );

    const nombreErp = normalizarTexto(producto.nombre);
    const otrosNombres = [
      ...new Map(
        (datos.otros_nombres ?? [])
          .map((n) => n.trim())
          .filter((n) => n && normalizarTexto(n) !== nombreErp)
          .map((n) => [normalizarTexto(n), n] as const),
      ).values(),
    ].slice(0, MAX_OTROS_NOMBRES);

    return {
      con_base_tecnica: true,
      // Mismas claves que /gpt/generateContentProduct: el formulario las asigna igual.
      descripcionCorta: this.sinEmojis(datos.descripcion_corta),
      descripcionLarga: this.limpiarHtml(datos.descripcion_larga_html),
      otrosNombres: otrosNombres.join(', '),
      documentos: docs.map((d) => d.nombre_original_bddoc),
      informacion_suficiente: datos.informacion_suficiente !== false,
      faltantes: datos.faltantes ?? [],
      complementado: dto.complementar === true,
    };
  }

  /**
   * Búsqueda dedicada de dosificación en TODAS las secciones de TODOS los documentos del producto
   * (español e inglés), independiente del recorte de contexto. Devuelve los fragmentos hallados
   * etiquetados por documento, o '' si no hay ninguno.
   */
  private async fragmentosDosificacion(docs: { ide_bddoc: number; etiqueta: string }[]): Promise<string> {
    const r = await this.dataSource.pool.query(
      `SELECT ide_bddoc, titulo_bdsec, contenido_bdsec, pagina_desde_bdsec
         FROM bdt_seccion
        WHERE ide_bddoc = ANY($1)
          AND bdt_f_unaccent(COALESCE(titulo_bdsec, '') || ' ' || COALESCE(contenido_bdsec, '')) ~* $2
        ORDER BY ide_bddoc, numero_bdsec NULLS LAST, ide_bdsec`,
      [docs.map((d) => d.ide_bddoc), PATRON_DOSIFICACION_SQL],
    );
    const regex = new RegExp(PATRON_DOSIFICACION_SQL, 'i');
    const bloques: string[] = [];
    let usado = 0;
    for (const s of r.rows) {
      const contenido: string = s.contenido_bdsec ?? '';
      const sinTildes = contenido.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const m = regex.exec(sinTildes) ?? regex.exec(`${s.titulo_bdsec ?? ''}`);
      const pos = m && sinTildes.length === contenido.length ? m.index : 0;
      const fragmento = contenido.slice(Math.max(0, pos - 300), pos + MAX_FRAGMENTO_DOSIS).trim();
      const etiqueta = docs.find((d) => d.ide_bddoc === s.ide_bddoc)?.etiqueta ?? '?';
      const bloque = `[${etiqueta}${s.pagina_desde_bdsec ? ` p.${s.pagina_desde_bdsec}` : ''}] ${s.titulo_bdsec ?? ''}:\n${fragmento}`;
      if (usado + bloque.length > MAX_TOTAL_DOSIS) break;
      bloques.push(bloque);
      usado += bloque.length;
    }
    return bloques.length
      ? `FRAGMENTOS CON POSIBLE DOSIFICACIÓN (buscados en todos los documentos del producto):\n${bloques.join('\n')}`
      : '';
  }

  /** Sinónimos registrados en la base técnica (aprobados primero), sin el nombre del ERP. */
  private async sinonimosDocumentos(ideInarti: number, ideEmpr: number, nombreProducto: string): Promise<string[]> {
    const r = await this.dataSource.pool.query(
      `SELECT sinonimo_bdsin FROM bdt_sinonimo
        WHERE ide_inarti = $1 AND ide_empr = $2 AND sinonimo_norm_bdsin <> UPPER(bdt_f_unaccent(TRIM($3)))
        ORDER BY aprobado_bdsin DESC, ide_bdsin
        LIMIT 15`,
      [ideInarti, ideEmpr, nombreProducto],
    );
    return r.rows.map((x) => x.sinonimo_bdsin);
  }

  /** La descripción corta va sin emojis (el prompt lo pide; esto lo garantiza). */
  private sinEmojis(texto: string): string {
    return (texto ?? '')
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private limpiarHtml(html: string): string {
    return (html ?? '')
      .replace(/```(html)?/g, '')
      .replace(/\n|\t/g, '')
      .replace(/<h[1-5]>/g, '<h6>')
      .replace(/<\/h[1-5]>/g, '</h6>')
      .trim();
  }
}
