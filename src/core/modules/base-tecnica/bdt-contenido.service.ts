import { Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { BdtConsultaService } from './bdt-consulta.service';
import { BdtIaService } from './bdt-ia.service';
import { BdtProcesoService } from './bdt-proceso.service';
import { BDT_CONFIG } from './constants/base-tecnica.constants';
import { IdeInartiDto } from './dto/ide-inarti.dto';
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
  'dosage packaging specifications properties storage';

const MAX_OTROS_NOMBRES = 3;

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

  async generarContenidoProducto(dto: IdeInartiDto & HeaderParamsDto) {
    const producto = await this.proceso.getProductoErp(dto.ide_inarti);
    const { docs, texto } = await this.consulta.construirContexto(
      dto.ide_inarti,
      dto.ideEmpr,
      TEMAS_CONTENIDO,
      producto.nombre,
    );
    if (!docs.length) return { con_base_tecnica: false };

    const sinonimos = await this.sinonimosDocumentos(dto.ide_inarti, dto.ideEmpr, producto.nombre);

    const { datos, tokensEntrada, tokensSalida } = await this.ia.completarJson<ContenidoProductoIa>(
      [
        { role: 'system', content: promptContenidoProducto(sinonimos) },
        { role: 'user', content: texto },
      ],
      SCHEMA_CONTENIDO_PRODUCTO as unknown as Record<string, unknown>,
      'contenido_producto',
      { modelo: BDT_CONFIG.MODELO_CONTENIDO, temperatura: 0.3, maxTokens: 3000 },
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
      descripcionCorta: datos.descripcion_corta.trim(),
      descripcionLarga: this.limpiarHtml(datos.descripcion_larga_html),
      otrosNombres: otrosNombres.join(', '),
      documentos: docs.map((d) => d.nombre_original_bddoc),
    };
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

  private limpiarHtml(html: string): string {
    return (html ?? '')
      .replace(/```(html)?/g, '')
      .replace(/\n|\t/g, '')
      .replace(/<h[1-5]>/g, '<h6>')
      .replace(/<\/h[1-5]>/g, '</h6>')
      .trim();
  }
}
