import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery } from 'src/core/connection/helpers';
import { GptService } from 'src/core/integration/gpt/gpt.service';
import { CoreService } from 'src/core/core.service';

import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { AplicarConfigPreciosIaDto, ProponerConfigPreciosIaDto } from './dto/config-precios-ia.dto';

/** RUC entre los que se hizo el traspaso por cambio de razón social: no son ventas reales. */
const RUC_EXCLUIDOS = ['1719020883001', '1793234926001'];
const MAX_CONFIGURACIONES = 15;
const MAX_POR_TIPO = 8;
const MAX_EXACTAS_POR_TIPO = 10;

/** Umbrales frecuentes por tipo de pago, más todas las cantidades realmente vendidas (para anclar las exactas). */
type Umbrales = Map<number | null, number[]> & { vendidas?: Map<number | null, number[]> };
const PREFIJO_OBSERVACION = 'Config IA';

type Linea = {
  tipo: number | null;
  nombreTipo: string;
  medio: string;
  cantidad: number;
  precio: number;
  costo: number;
  valida: boolean;
};

type TierIa = {
  ide_cncfp: number | null;
  desde: number;
  hasta: number | null;
  /** margen: % de utilidad sobre el costo; precio_fijo: varias ventas siempre al mismo precio (precio estándar). */
  patron: 'margen' | 'precio_fijo';
  /** true: aplica a UNA cantidad exacta (desde); no forma parte de la cadena de rangos. */
  exacta: boolean;
  razon: string;
};

type RespuestaIa = {
  resumen: string;
  advertencias: string[];
  configuraciones: TierIa[];
};

export type ConfigPrecioPropuesta = {
  ide_cncfp: number | null;
  nombre_cncfp: string;
  rango1: number;
  rango2: number | null;
  rango_infinito: boolean;
  /** true: cantidad exacta (rango1) con precio estándar; false: rango de cantidades. */
  exacta: boolean;
  /** utilidad: el valor es un % sobre el costo; fijo: el valor es el precio sin IVA. */
  modo: 'utilidad' | 'fijo';
  /** % de utilidad (modo utilidad) o precio sin IVA (modo fijo): calculado con los datos, no por el modelo. */
  valor: number;
  /** % de utilidad SIEMPRE: el propuesto, o el que equivale al precio fijo con el costo actual. */
  utilidad_pct: number;
  /** Precio sin IVA que resulta hoy con el costo promedio actual. */
  precio_hoy: number | null;
  ventas: number;
  /** % de las ventas del rango que coinciden con el patrón propuesto (±1,5 % en precio o ±5 puntos en margen). */
  coherencia: number;
  margen_min: number;
  margen_max: number;
  precio_min: number;
  precio_max: number;
  razon: string;
  /** false: se muestra para que el usuario la vea, pero no se propone aplicarla (viene desmarcada). */
  sugerida: boolean;
  /** Por qué no se sugiere (solo si sugerida = false). */
  motivo: string | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function mediana(valores: number[]): number {
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentil(valores: number[], p: number): number {
  const s = [...valores].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
}

const margenLinea = (l: Linea) => ((l.precio - l.costo) / l.costo) * 100;

/**
 * Margen típico del conjunto: mediana de los márgenes de cada línea. No se pondera por cantidad: una venta grande
 * a margen bajo no debe arrastrar al resto (en productos caros las cantidades pequeñas son las de mayor utilidad).
 */
function margenPonderado(lineas: Linea[]): number {
  return lineas.length > 0 ? mediana(lineas.map(margenLinea)) : 0;
}

const ESQUEMA_RESPUESTA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumen', 'advertencias', 'configuraciones'],
  properties: {
    resumen: { type: 'string' },
    advertencias: { type: 'array', items: { type: 'string' } },
    configuraciones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ide_cncfp', 'desde', 'hasta', 'patron', 'exacta', 'razon'],
        properties: {
          ide_cncfp: { type: ['integer', 'null'] },
          desde: { type: 'number' },
          hasta: { type: ['number', 'null'] },
          patron: { type: 'string', enum: ['margen', 'precio_fijo'] },
          exacta: { type: 'boolean' },
          razon: { type: 'string' },
        },
      },
    },
  },
};

const PROMPT_SISTEMA = `Eres un analista de precios de una empresa distribuidora de productos químicos en Ecuador.
Recibes el historial de ventas de UN producto, resumido por tipo de pago y por cantidad vendida. Para cada nivel de cantidad
verás: número de ventas, precio unitario sin IVA (mediana, mínimo y máximo), costo unitario promedio y margen de utilidad
sobre el costo (ponderado, mínimo y máximo). Todos los números ya están calculados correctamente: NO los recalcules.

Tu trabajo es detectar CÓMO se fijó realmente el precio y proponer la configuración de precios MÁS SIMPLE que lo reproduzca:
1. Escalones por cantidad. Un distribuidor maneja una lista de precios por volumen con escalones comerciales (los escalones dependen de cada producto: unos se venden desde 100 g, otros solo en sacos de 25 kg, otros
   desde 500 g; NO supongas ninguno, deducelos únicamente de los datos y de la unidad del producto). El sistema ya detectó, por cada tipo de pago, las "cantidades_frecuentes"
   (cantidades exactas que se repiten mucho: son los umbrales comerciales probables) y calculó las "bandas_candidatas" entre
   esos umbrales, con su precio (mediana, p10, p90), margen, costo y "pct_precio_estable" (porcentaje de ventas de la banda
   cuyo precio está dentro de ±1,5 % de la mediana). Tu tarea es elegir CUÁLES de esos umbrales son escalones reales:
   - Un umbral es real si el precio o el margen de la banda que empieza ahí difiere de la banda anterior de forma sostenida
     (más de ~3 % en precio o ~4 puntos en margen) con ventas suficientes. Conserva esos escalones aunque sean muchos.
   - Fusiona bandas contiguas SOLO si su precio y margen son prácticamente iguales. No unas bandas distintas para "simplificar".
   - "desde" de cada rango (salvo el primero, que es 0) DEBE ser exactamente uno de los valores de "cantidades_frecuentes".
   - Ignora ventas atípicas (descuentos puntuales, errores, clientes especiales).
   - Regla comercial: las cantidades mínimas (las más pequeñas) llevan por lo general el MAYOR margen, y el margen baja a
     medida que sube la cantidad. Por eso NO fusiones las cantidades pequeñas con bandas más grandes: conserva sus propios
     escalones aunque tengan pocas ventas, siempre que su margen sea claramente más alto que el de la banda siguiente.
   - Si varias cantidades seguidas tienen el mismo precio fijo, NO las separes en cantidades exactas: usa un solo rango
     con patron precio_fijo que las cubra. Una cantidad exacta solo se justifica si su precio difiere del rango que la
     contiene.
   - Revisa SIEMPRE una por una las 3 o 4 cantidades más pequeñas de "niveles" con 3 o más ventas. Si una tiene precio
     estable (pct_precio_estable alto) y distinto al de la cantidad siguiente, dale su propia configuración como cantidad
     exacta (exacta=true, patron precio_fijo); si varias son así, una configuración por cada cantidad. Si en cambio su
     precio varía, dale un rango propio con patrón margen.
2. Tipo de precio de cada configuración ("patron"):
   - "margen" (por defecto): porcentaje de utilidad sobre el costo. El costo promedio varía con el tiempo, así que es lo
     normal. El porcentaje será el margen histórico del rango.
   - "precio_fijo": cuando hay un precio ESTÁNDAR: varias ventas (mínimo 3) siempre al mismo precio unitario (variación
     menor a ~1,5 %) aunque el margen cambie por el costo. Es típico de productos con presentaciones o cantidades de lista
     (por ejemplo fragancias de 0,050 y 0,100 con precio fijo). Mira "niveles": una cantidad con muchas ventas y
     "pct_precio_estable" alto es un precio estándar.
   - "exacta": true si el precio estándar corresponde a UNA cantidad exacta (desde = esa cantidad, hasta = null). Estas
     configuraciones NO forman parte de la cadena de rangos y conviven con rangos que cubren el resto de cantidades.
     false para rangos. Una cantidad exacta siempre usa patron "precio_fijo".
   Detecta primero las cantidades exactas con precio estándar muy repetido; el resto de cantidades se cubre con rangos
   (siempre debe existir la cadena de rangos desde 0 hasta sin límite). Ante la duda usa "margen" en rango.
3. Tipos de pago: configura cada tipo (por ejemplo Contado, Crédito) que tenga ventas suficientes (4 o más líneas válidas).
   Un tipo con muy pocas ventas no merece configuración propia: no lo incluyas (su ide_cncfp no debe aparecer). Solo usa
   ide_cncfp = null (configuración genérica para cualquier tipo de pago) si aporta algo para tipos sin ventas suficientes.
   Si dos tipos de pago siguen el mismo patrón igualmente genera las configuraciones de cada tipo.
4. Reglas obligatorias: por cada tipo, los rangos son consecutivos, el primero empieza en 0 y el último termina en null
   (sin límite). "desde" de cada rango posterior debe ser una cantidad que exista en los datos. "hasta" de un rango puede
   ponerse en null salvo que sea el último; el sistema lo ajusta. Máximo 8 rangos y 10 cantidades exactas por tipo, y 15 configuraciones en total.
5. En "razon" explica en una frase corta y concreta qué patrón viste (ej. "Precio estable en $4,50 hasta 20 L; desde 20 L baja
   a $4,20"). En "resumen" resume el hallazgo general en 2-3 frases. En "advertencias" lista cosas que el usuario debe revisar
   (pocos datos, costos que cambiaron mucho, márgenes negativos o cercanos a cero, patrones contradictorios). Escribe en español.`;

@Injectable()
export class ConfigPreciosIaService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
    private readonly gpt: GptService,
  ) {}

  /** Líneas de factura del producto con costo PPMP y precio neto sin IVA, ya depuradas de traspasos. */
  private async obtenerLineas(dto: ProponerConfigPreciosIaDto, ideEmpr: number) {
    const query = new SelectQuery(`
      WITH facturas_con_nota AS (
          SELECT lpad(cf.secuencial_cccfa::text, 9, '0') AS secuencial_padded,
                 SUM(cdn.valor_cpdno) AS valor_nota_credito
          FROM cxp_cabecera_nota cn
          JOIN cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
          JOIN cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
          WHERE cn.fecha_emisi_cpcno BETWEEN $2::date AND $3::date
            AND cn.ide_cpeno = 1
            AND cdn.ide_inarti = $1
            AND cn.ide_empr = cf.ide_empr
            AND cn.ide_sucu = cf.ide_sucu
          GROUP BY lpad(cf.secuencial_cccfa::text, 9, '0')
      )
      SELECT
          fpg.ide_cncfp AS tipo,
          cp.nombre_cncfp AS nombre_tipo,
          fpg.nombre_cndfp AS medio,
          cdf.cantidad_ccdfa::float8 AS cantidad,
          (CASE WHEN cdf.iva_inarti_ccdfa = -1
                THEN (cdf.total_ccdfa / cdf.cantidad_ccdfa)
                     / (1 + COALESCE(NULLIF(CASE WHEN cf.tarifa_iva_cccfa > 1 THEN cf.tarifa_iva_cccfa / 100
                                                 ELSE cf.tarifa_iva_cccfa END, 0), 0.15))
                ELSE cdf.total_ccdfa / cdf.cantidad_ccdfa END)::float8 AS precio,
          ppmp.costo_unitario::float8 AS costo,
          (iart.hace_kardex_inarti IS TRUE
             AND COALESCE(ppmp.costo_unitario, 0) > 0
             AND COALESCE(fn.valor_nota_credito, 0) = 0
             AND cdf.total_ccdfa > 0) AS valida
      FROM cxc_deta_factura cdf
      JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
      JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
      JOIN gen_persona per ON per.ide_geper = cf.ide_geper
      LEFT JOIN con_deta_forma_pago fpg ON fpg.ide_cndfp = cf.ide_cndfp1
      LEFT JOIN con_cabece_forma_pago cp ON cp.ide_cncfp = fpg.ide_cncfp
      LEFT JOIN facturas_con_nota fn ON fn.secuencial_padded = lpad(cf.secuencial_cccfa::text, 9, '0')
      LEFT JOIN LATERAL (
          SELECT p.costo_unitario
          FROM f_costo_unitario_ppmp(${ideEmpr}, cf.ide_sucu, cdf.ide_inarti, cf.fecha_emisi_cccfa) p
      ) ppmp ON TRUE
      WHERE cf.ide_ccefa = 0
        AND cf.fecha_emisi_cccfa BETWEEN $2::date AND $3::date
        AND cf.ide_empr = ${ideEmpr}
        AND cdf.ide_inarti = $1
        AND cdf.cantidad_ccdfa > 0
        AND per.identificac_geper NOT IN (${RUC_EXCLUIDOS.map((r) => `'${r}'`).join(', ')})
    `);
    query.addParam(1, dto.ide_inarti);
    query.addParam(2, dto.fechaInicio);
    query.addParam(3, dto.fechaFin);
    query.setLazy(false);
    const filas = (await this.dataSource.createSelectQuery(query)) as any[];

    return filas.map<Linea>((f) => ({
      tipo: f.tipo === null || f.tipo === undefined ? null : Number(f.tipo),
      nombreTipo: f.nombre_tipo ?? 'Sin forma de pago',
      medio: f.medio ?? 'Sin forma de pago',
      cantidad: Number(f.cantidad),
      precio: Number(f.precio),
      costo: Number(f.costo) || 0,
      valida: f.valida === true,
    }));
  }

  /** Resumen por tipo de pago y cantidad que se le entrega al modelo (todo calculado aquí, no por el modelo). */
  private resumirParaModelo(lineas: Linea[]) {
    const tipos = new Map<string, Linea[]>();
    lineas.forEach((l) => {
      const clave = String(l.tipo);
      tipos.set(clave, [...(tipos.get(clave) ?? []), l]);
    });

    return [...tipos.values()].map((grupo) => {
      const validas = grupo.filter((l) => l.valida);
      const porCantidad = new Map<number, Linea[]>();
      validas.forEach((l) => porCantidad.set(l.cantidad, [...(porCantidad.get(l.cantidad) ?? []), l]));

      const medios: Record<string, number> = {};
      grupo.forEach((l) => {
        medios[l.medio] = (medios[l.medio] ?? 0) + 1;
      });

      const minHits = Math.max(3, Math.ceil(validas.length * 0.015));
      const umbrales = [...porCantidad.entries()]
        .filter(([, ls]) => ls.length >= minHits)
        .sort((x, y) => y[1].length - x[1].length)
        .slice(0, 25)
        .map(([cantidad]) => cantidad)
        .sort((x, y) => x - y);
      // Si casi no hay cantidades repetidas, los umbrales salen de la distribución real de lo vendido (cuantiles).
      if (umbrales.length < 3 && porCantidad.size >= 4) {
        const cantidades = [...porCantidad.keys()].sort((x, y) => x - y);
        [0.2, 0.4, 0.6, 0.8].forEach((p) => {
          const q = cantidades[Math.min(cantidades.length - 1, Math.round((cantidades.length - 1) * p))];
          if (q > 0 && !umbrales.includes(q)) umbrales.push(q);
        });
        umbrales.sort((x, y) => x - y);
      }
      const limites = [0, ...umbrales.filter((q) => q > 0)];
      const bandas = limites
        .map((desde, i) => {
          const hasta = limites[i + 1];
          const ls = validas.filter((l) => l.cantidad >= desde && (hasta === undefined || l.cantidad < hasta));
          if (ls.length === 0) return null;
          const med = mediana(ls.map((l) => l.precio));
          return {
            desde,
            hasta: hasta ?? null,
            ventas: ls.length,
            precio_mediana: r4(med),
            precio_p10: r4(
              percentil(
                ls.map((l) => l.precio),
                0.1,
              ),
            ),
            precio_p90: r4(
              percentil(
                ls.map((l) => l.precio),
                0.9,
              ),
            ),
            costo_promedio: r4(ls.reduce((acc, l) => acc + l.costo, 0) / ls.length),
            margen_pct: r2(margenPonderado(ls)),
            pct_precio_estable: Math.round(
              (ls.filter((l) => Math.abs(l.precio - med) / med <= 0.015).length / ls.length) * 100,
            ),
          };
        })
        .filter((b) => b !== null);

      return {
        ide_cncfp: grupo[0].tipo,
        tipo_de_pago: grupo[0].nombreTipo,
        lineas_totales: grupo.length,
        lineas_validas: validas.length,
        cantidades_frecuentes: umbrales,
        bandas_candidatas: bandas,
        medios_de_pago: medios,
        niveles: [...porCantidad.entries()]
          .sort((a, b) => a[0] - b[0])
          .slice(0, 150)
          .map(([cantidad, ls]) => ({
            cantidad,
            ventas: ls.length,
            precio_mediana: r4(mediana(ls.map((l) => l.precio))),
            precio_min: r4(Math.min(...ls.map((l) => l.precio))),
            precio_max: r4(Math.max(...ls.map((l) => l.precio))),
            pct_precio_estable: Math.round(
              (ls.filter(
                (l) =>
                  Math.abs(l.precio - mediana(ls.map((x) => x.precio))) / mediana(ls.map((x) => x.precio)) <= 0.015,
              ).length /
                ls.length) *
                100,
            ),
            costo_promedio: r4(ls.reduce((a, l) => a + l.costo, 0) / ls.length),
            margen_pct: r2(margenPonderado(ls)),
            margen_min: r2(Math.min(...ls.map(margenLinea))),
            margen_max: r2(Math.max(...ls.map(margenLinea))),
          })),
      };
    });
  }

  /** El corte de un rango debe ser un umbral comercial real (cantidad frecuente): se ajusta al más cercano. */
  private ajustarAUmbral(desde: number, umbrales?: number[]): number {
    if (!umbrales || umbrales.length === 0 || desde === 0) return desde;
    return umbrales.reduce((mejor, q) => (Math.abs(q - desde) < Math.abs(mejor - desde) ? q : mejor), umbrales[0]);
  }

  /**
   * Si un rango propuesto es poco consistente (los márgenes de sus ventas se dispersan), se parte en las cantidades
   * donde más mejora (umbrales frecuentes o cualquier cantidad con 3+ ventas), hasta lograr consistencia o llegar al
   * máximo de rangos por tipo de pago.
   */
  private refinar(tiers: TierIa[], validas: Linea[], umbrales: Umbrales, paso: number): TierIa[] {
    const salida: TierIa[] = tiers.filter((t) => t.exacta || t.ide_cncfp === null);
    const tipos = new Set(tiers.filter((t) => !t.exacta && t.ide_cncfp !== null).map((t) => t.ide_cncfp));

    tipos.forEach((tipo) => {
      const exactas = tiers.filter((t) => t.exacta && t.ide_cncfp === tipo).map((t) => t.desde);
      const lineasTipo = validas.filter(
        (l) => l.tipo === tipo && !exactas.some((q) => Math.abs(l.cantidad - q) < paso / 2),
      );
      const propios = tiers.filter((t) => !t.exacta && t.ide_cncfp === tipo).sort((a, b) => a.desde - b.desde);
      if (propios.length === 0) return;
      let cortes = propios.map((t, i) => (i === 0 ? 0 : t.desde));

      const conteo = new Map<number, number>();
      lineasTipo.forEach((l) => conteo.set(l.cantidad, (conteo.get(l.cantidad) ?? 0) + 1));
      const candidatos = [
        ...new Set([...(umbrales.get(tipo) ?? []), ...[...conteo.entries()].filter(([, n]) => n >= 3).map(([q]) => q)]),
      ].sort((x, y) => x - y);

      const dentro = (ls: Linea[]) => {
        if (ls.length === 0) return 0;
        const m = margenPonderado(ls);
        return ls.filter((l) => Math.abs(margenLinea(l) - m) <= 5).length;
      };
      const enRango = (desde: number, hasta: number | null) =>
        lineasTipo.filter((l) => l.cantidad >= desde && (hasta === null || l.cantidad < hasta));

      while (cortes.length < MAX_POR_TIPO) {
        let mejor: { corte: number; ganancia: number } | null = null;
        cortes.forEach((desde, i) => {
          const hasta = cortes[i + 1] ?? null;
          const ls = enRango(desde, hasta);
          if (ls.length < 8 || dentro(ls) / ls.length >= 0.7) return;
          candidatos
            .filter((q) => q > desde && (hasta === null || q < hasta))
            .forEach((q) => {
              const izq = ls.filter((l) => l.cantidad < q);
              const der = ls.filter((l) => l.cantidad >= q);
              if (izq.length < 3 || der.length < 3) return;
              const ganancia = dentro(izq) + dentro(der) - dentro(ls);
              if (ganancia >= Math.max(3, ls.length * 0.08) && (!mejor || ganancia > mejor.ganancia)) {
                mejor = { corte: q, ganancia };
              }
            });
        });
        if (!mejor) break;
        cortes = [...cortes, (mejor as { corte: number }).corte].sort((a, b) => a - b);
      }

      cortes.forEach((desde, i) => {
        const original = propios.find((t, k) => (k === 0 ? 0 : t.desde) === desde);
        salida.push(
          original ?? {
            ide_cncfp: tipo,
            desde,
            hasta: null,
            patron: 'margen',
            exacta: false,
            razon: 'Rango dividido: el margen varía dentro del rango propuesto',
          },
        );
        if (original && i === 0) original.desde = 0;
      });
    });
    return salida;
  }

  /** Ajusta lo que propone el modelo a rangos válidos y continuos por tipo, sin confiar en sus números. */
  private normalizar(
    tiers: TierIa[],
    tiposDisponibles: Set<number | null>,
    paso: number,
    umbrales: Umbrales,
  ): TierIa[] {
    const porTipo = new Map<number | null, TierIa[]>();
    tiers
      .filter((t) => tiposDisponibles.has(t.ide_cncfp))
      .forEach((t) => porTipo.set(t.ide_cncfp, [...(porTipo.get(t.ide_cncfp) ?? []), t]));

    const salida: TierIa[] = [];
    porTipo.forEach((lista) => {
      const ajustar = (t: TierIa) => ({
        ...t,
        desde: this.ajustarAUmbral(Math.max(0, Number(t.desde) || 0), umbrales.get(t.ide_cncfp)),
      });

      // Cantidades exactas con precio estándar: no forman cadena de rangos, una por cantidad.
      lista
        .filter((t) => t.exacta && Number(t.desde) > 0)
        // Una cantidad exacta se ancla a la cantidad realmente vendida más cercana (no a un umbral de rangos).
        .map((t) => {
          const reales = umbrales.vendidas?.get(t.ide_cncfp) ?? [];
          const cercana = reales.reduce<number | null>(
            (m, q) => (m === null || Math.abs(q - t.desde) < Math.abs(m - t.desde) ? q : m),
            null,
          );
          const desde = cercana !== null && Math.abs(cercana - t.desde) / t.desde <= 0.15 ? cercana : t.desde;
          return { ...t, desde: Math.max(0, Number(desde) || 0) };
        })
        .filter((t, i, arr) => arr.findIndex((x) => x.desde === t.desde) === i)
        .slice(0, MAX_EXACTAS_POR_TIPO)
        .forEach((t) => salida.push({ ...t, patron: 'precio_fijo', hasta: null, exacta: true }));

      const ordenados = lista
        .filter((t) => !t.exacta)
        .map(ajustar)
        .sort((a, b) => a.desde - b.desde)
        // dos rangos que empiezan en la misma cantidad son uno solo: se conserva el primero
        .filter((t, i, arr) => i === 0 || t.desde > arr[i - 1].desde)
        .slice(0, MAX_POR_TIPO);
      ordenados.forEach((t, i) => {
        const siguiente = ordenados[i + 1];
        salida.push({
          ...t,
          exacta: false,
          desde: i === 0 ? 0 : t.desde,
          hasta: siguiente ? r4(siguiente.desde - paso) : null,
        });
      });
    });
    return salida;
  }

  /** Costo promedio (PPM) vigente hoy: el que usa el motor de precios para aplicar el porcentaje. */
  private async costoActual(ideInarti: number, ideEmpr: number, ideSucu: number): Promise<number> {
    const q = new SelectQuery(
      `SELECT costo_unitario::float8 AS costo FROM f_costo_unitario_ppmp(${ideEmpr}, ${ideSucu}, $1, CURRENT_DATE)`,
    );
    q.addParam(1, ideInarti);
    const fila = ((await this.dataSource.createSelectQuery(q)) as any[])[0];
    return Number(fila?.costo) || 0;
  }

  async proponer(dtoIn: ProponerConfigPreciosIaDto & HeaderParamsDto) {
    if (dtoIn.fechaInicio > dtoIn.fechaFin) {
      throw new BadRequestException('La fecha inicial no puede ser mayor que la final');
    }

    const qProd = new SelectQuery(
      `SELECT nombre_inarti, COALESCE(decim_stock_inarti, 2) AS decimales, siglas_inuni
       FROM inv_articulo a LEFT JOIN inv_unidad u ON u.ide_inuni = a.ide_inuni WHERE a.ide_inarti = $1`,
    );
    qProd.addParam(1, dtoIn.ide_inarti);
    const prod = ((await this.dataSource.createSelectQuery(qProd)) as any[])[0];
    if (!prod) throw new BadRequestException('El producto no existe');
    const paso = 10 ** -Number(prod.decimales);

    const lineas = await this.obtenerLineas(dtoIn, Number(dtoIn.ideEmpr));
    if (lineas.length === 0) {
      throw new BadRequestException('No hay ventas de este producto en el período elegido');
    }
    const validas = lineas.filter((l) => l.valida);
    if (validas.length < 3) {
      throw new BadRequestException(
        'Hay muy pocas ventas con costo en kardex en el período para calcular una utilidad confiable',
      );
    }

    const resumen = this.resumirParaModelo(lineas);
    const tiposDisponibles = new Set<number | null>(
      resumen.filter((t) => t.lineas_validas >= 4).map((t) => t.ide_cncfp),
    );
    tiposDisponibles.add(null);
    const umbrales: Umbrales = new Map<number | null, number[]>(
      resumen.map((t) => [t.ide_cncfp, t.cantidades_frecuentes] as [number | null, number[]]),
    );
    umbrales.vendidas = new Map(
      [...new Set(validas.map((l) => l.tipo))].map((tipo) => [
        tipo,
        [...new Set(validas.filter((l) => l.tipo === tipo).map((l) => l.cantidad))],
      ]),
    );

    const datos = {
      producto: prod.nombre_inarti,
      unidad: prod.siglas_inuni,
      decimales_cantidad: Number(prod.decimales),
      periodo: { desde: dtoIn.fechaInicio, hasta: dtoIn.fechaFin },
      lineas_validas: validas.length,
      lineas_descartadas_sin_costo_o_nota_credito: lineas.length - validas.length,
      tipos_de_pago: resumen,
    };

    const costoActual = await this.costoActual(dtoIn.ide_inarti, Number(dtoIn.ideEmpr), Number(dtoIn.ideSucu));

    let respuesta: RespuestaIa;
    try {
      respuesta = await this.gpt.jsonEstructurado<RespuestaIa>({
        system: PROMPT_SISTEMA,
        user: JSON.stringify(datos),
        schemaName: 'config_precios',
        schema: ESQUEMA_RESPUESTA,
      });
    } catch (error) {
      throw new BadRequestException(
        `No se pudo consultar a la IA: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }

    // ── El modelo decide los cortes y el tipo de precio; los valores se calculan aquí con los datos reales ──
    const advertenciasServidor: string[] = [];
    // Configuraciones que se descartan pero se muestran desmarcadas, para que el usuario decida.
    const omitidas: ConfigPrecioPropuesta[] = [];
    // Todo tipo de pago con ventas suficientes (p. ej. Crédito) tiene configuración aunque la IA lo omita:
    // parte de un solo rango y el refinamiento lo divide si hace falta.
    const propuestasIa = [...(respuesta.configuraciones ?? [])];
    tiposDisponibles.forEach((tipo) => {
      if (tipo !== null && !propuestasIa.some((t) => t.ide_cncfp === tipo)) {
        propuestasIa.push({
          ide_cncfp: tipo,
          desde: 0,
          hasta: null,
          patron: 'margen',
          exacta: false,
          razon: 'Tipo de pago con ventas suficientes: rango inicial según el margen observado',
        });
      }
    });
    // Cantidades mínimas con precio estándar (suelen tener la mayor utilidad): se detectan con los datos aunque la IA
    // no las haya separado, si su margen se aparta claramente del que tienen las cantidades mayores.
    tiposDisponibles.forEach((tipo) => {
      if (tipo === null) return;
      const lt = validas.filter((l) => l.tipo === tipo);
      const porCantidad = new Map<number, Linea[]>();
      lt.forEach((l) => porCantidad.set(l.cantidad, [...(porCantidad.get(l.cantidad) ?? []), l]));
      [...porCantidad.entries()]
        .filter(([, ls]) => ls.length >= 2)
        .sort((x, y) => x[0] - y[0])
        .slice(0, 4)
        .forEach(([cantidad, ls]) => {
          const med = mediana(ls.map((l) => l.precio));
          const estables = ls.filter((l) => Math.abs(l.precio - med) / med <= 0.015).length;
          const mayores = lt.filter((l) => l.cantidad > cantidad);
          if (estables / ls.length < (ls.length === 2 ? 1 : 0.7) || mayores.length < 3) return;
          if (Math.abs(margenPonderado(ls) - margenPonderado(mayores)) <= 8) return;
          if (propuestasIa.some((t) => t.ide_cncfp === tipo && t.exacta && Math.abs(t.desde - cantidad) < paso / 2))
            return;
          propuestasIa.push({
            ide_cncfp: tipo,
            desde: cantidad,
            hasta: null,
            patron: 'precio_fijo',
            exacta: true,
            razon: 'Cantidad pequeña con precio estándar y utilidad distinta a la de las cantidades mayores',
          });
        });
    });

    let tiers = this.normalizar(
      this.refinar(this.normalizar(propuestasIa, tiposDisponibles, paso, umbrales), validas, umbrales, paso),
      tiposDisponibles,
      paso,
      umbrales,
    );

    const calcular = (t: TierIa, todos: TierIa[]): ConfigPrecioPropuesta | null => {
      const tiposConConfig = new Set(todos.map((x) => x.ide_cncfp).filter((x) => x !== null));
      // Las cantidades con precio estándar tienen su propia configuración: no entran al cálculo de los rangos.
      const exactasDelTipo = todos.filter((x) => x.exacta && x.ide_cncfp === t.ide_cncfp).map((x) => x.desde);
      const ls = validas.filter((l) => {
        if (t.ide_cncfp === null ? tiposConConfig.has(l.tipo) : l.tipo !== t.ide_cncfp) return false;
        if (t.exacta) return Math.abs(l.cantidad - t.desde) < paso / 2;
        if (exactasDelTipo.some((q) => Math.abs(l.cantidad - q) < paso / 2)) return false;
        return l.cantidad >= t.desde && (t.hasta === null || l.cantidad <= t.hasta + paso / 2);
      });
      if (ls.length === 0) return null;

      const precios = ls.map((l) => l.precio);
      const med = mediana(precios);
      const margen = margenPonderado(ls);
      const constantes = ls.filter((l) => Math.abs(l.precio - med) / med <= 0.015).length;
      // Un precio estándar solo se acepta si de verdad se repite (≥3 ventas y ≥70 % de las del rango).
      const constante = constantes >= 3 && constantes / ls.length >= 0.7;
      const nombre = t.ide_cncfp === null ? 'Otras formas de pago' : (ls[0].nombreTipo ?? 'Tipo de pago');

      const fijo = t.patron === 'precio_fijo' && constante;
      if (t.patron === 'precio_fijo' && !constante && ls.length >= 3) {
        advertenciasServidor.push(
          `${nombre} desde ${t.desde}: la IA sugirió precio fijo pero los precios varían; se usó porcentaje de utilidad.`,
        );
      }

      const valor = fijo ? r4(med) : r2(margen);
      const utilidadPct = fijo
        ? costoActual > 0
          ? r2(((valor - costoActual) / costoActual) * 100)
          : r2(margen)
        : valor;
      const precioHoy = fijo ? valor : costoActual > 0 ? r4(costoActual * (1 + valor / 100)) : null;
      const coherentes = fijo ? constantes : ls.filter((l) => Math.abs(margenLinea(l) - margen) <= 5).length;
      const margenes = ls.map(margenLinea);

      const cfg: ConfigPrecioPropuesta = {
        ide_cncfp: t.ide_cncfp,
        nombre_cncfp: nombre,
        rango1: t.desde,
        rango2: t.hasta,
        rango_infinito: !t.exacta && t.hasta === null,
        exacta: t.exacta,
        modo: fijo ? 'fijo' : 'utilidad',
        valor,
        utilidad_pct: utilidadPct,
        precio_hoy: precioHoy,
        ventas: ls.length,
        coherencia: Math.round((coherentes / ls.length) * 100),
        margen_min: r2(percentil(margenes, 0.1)),
        margen_max: r2(percentil(margenes, 0.9)),
        precio_min: r4(percentil(precios, 0.1)),
        precio_max: r4(percentil(precios, 0.9)),
        razon: t.razon,
        sugerida: true,
        motivo: null,
      };
      if (t.exacta && !constante) {
        omitidas.push({
          ...cfg,
          sugerida: false,
          motivo: 'Sus precios varían: no hay un precio estándar para esta cantidad. Se muestra como % de utilidad.',
        });
        return null;
      }
      return cfg;
    };

    const calcularTodos = () =>
      tiers.map((t) => calcular(t, tiers)).filter((p): p is ConfigPrecioPropuesta => p !== null);
    let propuestas = calcularTodos();

    // Una cantidad exacta redundante (su precio fijo ya lo cubre un rango con el mismo precio) se elimina.
    const redundantes = propuestas.filter(
      (e) =>
        e.exacta &&
        e.modo === 'fijo' &&
        propuestas.some(
          (r) =>
            !r.exacta &&
            r.modo === 'fijo' &&
            r.ide_cncfp === e.ide_cncfp &&
            e.rango1 >= r.rango1 &&
            (r.rango2 === null || e.rango1 <= r.rango2) &&
            Math.abs(r.valor - e.valor) / e.valor <= 0.01,
        ),
    );
    if (redundantes.length > 0) {
      redundantes.forEach((e) =>
        omitidas.push({
          ...e,
          sugerida: false,
          motivo: 'Ya la cubre un rango con el mismo precio fijo; es redundante.',
        }),
      );
      tiers = tiers.filter(
        (t) => !redundantes.some((e) => e.ide_cncfp === t.ide_cncfp && e.rango1 === t.desde && t.exacta),
      );
      propuestas = calcularTodos();
    }

    // Un rango respaldado por menos de 3 ventas no es un escalón: se fusiona con el vecino y se recalcula.
    for (;;) {
      const debil = propuestas
        .filter(
          (p) =>
            !p.exacta && p.ventas < 3 && propuestas.filter((x) => !x.exacta && x.ide_cncfp === p.ide_cncfp).length > 1,
        )
        .sort((x, y) => x.ventas - y.ventas)[0];
      if (!debil) break;
      omitidas.push({
        ...debil,
        sugerida: false,
        motivo: `Solo ${debil.ventas} venta${debil.ventas === 1 ? '' : 's'}: se fusionó con el rango vecino. Si la marcas, se superpone con él.`,
      });
      tiers = this.normalizar(
        tiers.filter((t) => !(t.ide_cncfp === debil.ide_cncfp && t.desde === debil.rango1 && !t.exacta)),
        tiposDisponibles,
        paso,
        umbrales,
      );
      propuestas = calcularTodos();
    }

    // Tope total: se quita la configuración con menos ventas y se vuelve a ajustar la continuidad.
    while (propuestas.length > MAX_CONFIGURACIONES) {
      const menor = propuestas.reduce((a, b) => (b.ventas < a.ventas ? b : a));
      tiers = this.normalizar(
        tiers.filter(
          (t) => !(t.ide_cncfp === menor.ide_cncfp && t.desde === menor.rango1 && t.exacta === menor.exacta),
        ),
        tiposDisponibles,
        paso,
        umbrales,
      );
      propuestas = calcularTodos();
    }

    if (propuestas.length === 0) {
      throw new BadRequestException('La IA no encontró un patrón de precios suficiente con los datos del período');
    }

    // Sin huecos tras quitar rangos sin ventas: el primero de cada tipo parte de 0 y el último es abierto.
    const porTipo = new Map<number | null, ConfigPrecioPropuesta[]>();
    propuestas
      .filter((p) => !p.exacta)
      .forEach((p) => porTipo.set(p.ide_cncfp, [...(porTipo.get(p.ide_cncfp) ?? []), p]));
    porTipo.forEach((lista) => {
      lista.sort((a, b) => a.rango1 - b.rango1);
      lista.forEach((p, i) => {
        const sig = lista[i + 1];
        p.rango1 = i === 0 ? 0 : p.rango1;
        p.rango2 = sig ? r4(sig.rango1 - paso) : null;
        p.rango_infinito = !sig;
      });
    });

    propuestas
      .filter((p) => !p.exacta && p.ventas >= 8 && p.coherencia < 50)
      .forEach((p) =>
        advertenciasServidor.push(
          `${p.nombre_cncfp} ${p.rango1}${p.rango2 === null ? '+' : ' a ' + p.rango2}: los márgenes varían mucho dentro del rango (consistencia ${p.coherencia} %); revisa si depende del cliente y no de la cantidad.`,
        ),
      );

    // Lo normal es que el margen baje al subir la cantidad; un rango mayor con margen mayor merece revisión.
    const cadenas = new Map<number | null, ConfigPrecioPropuesta[]>();
    propuestas
      .filter((p) => !p.exacta)
      .forEach((p) => cadenas.set(p.ide_cncfp, [...(cadenas.get(p.ide_cncfp) ?? []), p]));
    cadenas.forEach((lista) => {
      lista.sort((x, y) => x.rango1 - y.rango1);
      lista.forEach((p, i) => {
        if (i > 0 && p.utilidad_pct > lista[i - 1].utilidad_pct + 3) {
          advertenciasServidor.push(
            `${p.nombre_cncfp} desde ${p.rango1}: la utilidad (${p.utilidad_pct} %) es mayor que en la cantidad menor (${lista[i - 1].utilidad_pct} %); lo habitual es que baje al subir la cantidad.`,
          );
        }
      });
    });

    const advertencias = [...(respuesta.advertencias ?? []), ...advertenciasServidor];
    const descartados = resumen.filter((t) => t.lineas_validas < 4 && t.lineas_validas > 0);
    if (descartados.length > 0) {
      advertencias.push(
        `Sin configuración propia por pocas ventas: ${descartados
          .map((t) => `${t.tipo_de_pago} (${t.lineas_validas})`)
          .join(', ')}.`,
      );
    }
    propuestas
      .filter((p) => p.utilidad_pct < 5)
      .forEach((p) =>
        advertencias.push(
          `${p.nombre_cncfp} ${p.rango1}+: la utilidad es muy baja (${p.utilidad_pct} %). Verifica que no sean ventas al costo.`,
        ),
      );

    return {
      producto: prod.nombre_inarti,
      unidad: prod.siglas_inuni,
      periodo: { fechaInicio: dtoIn.fechaInicio, fechaFin: dtoIn.fechaFin },
      costoActual: r4(costoActual),
      lineasAnalizadas: validas.length,
      lineasDescartadas: lineas.length - validas.length,
      resumen: respuesta.resumen,
      advertencias: [...new Set(advertencias)],
      configuraciones: [
        ...propuestas,
        ...omitidas.filter(
          (o, idx) =>
            omitidas.findIndex((x) => x.ide_cncfp === o.ide_cncfp && x.exacta === o.exacta && x.rango1 === o.rango1) ===
              idx &&
            !propuestas.some((p) => p.ide_cncfp === o.ide_cncfp && p.exacta === o.exacta && p.rango1 === o.rango1),
        ),
      ].sort(
        (a, b) =>
          (a.ide_cncfp ?? 99) - (b.ide_cncfp ?? 99) || Number(b.exacta) - Number(a.exacta) || a.rango1 - b.rango1,
      ),
    };
  }

  /** Guarda la propuesta (ya revisada por el usuario). Reemplaza solo lo generado antes automáticamente. */
  async aplicar(dtoIn: AplicarConfigPreciosIaDto & HeaderParamsDto) {
    dtoIn.configuraciones.forEach((c, i) => {
      if (c.exacta) {
        if (c.rango1 <= 0) {
          throw new BadRequestException(`La cantidad exacta de la configuración ${i + 1} no es válida`);
        }
      } else if (c.rango_infinito ? c.rango2 != null : c.rango2 == null || c.rango2 < c.rango1) {
        throw new BadRequestException(`El rango de la configuración ${i + 1} no es válido`);
      }
      if (c.modo === 'utilidad' ? c.valor < 0 : c.valor <= 0) {
        throw new BadRequestException(`El valor de la configuración ${i + 1} no es válido`);
      }
    });

    const borrar = new DeleteQuery('inv_conf_precios_articulo');
    borrar.where = `ide_inarti = $1 AND (observacion_incpa LIKE '${PREFIJO_OBSERVACION}%' OR observacion_incpa LIKE 'Config automática%')`;
    borrar.addParam(1, dtoIn.ide_inarti);
    await this.dataSource.createQuery(borrar);

    const module = 'inv';
    const tableName = 'conf_precios_articulo';
    const primaryKey = 'ide_incpa';
    const listQuery: ObjectQueryDto[] = [];

    for (const c of dtoIn.configuraciones) {
      const ide = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);
      listQuery.push({
        operation: 'insert',
        module,
        tableName,
        primaryKey,
        object: {
          ide_incpa: ide,
          ide_inarti: dtoIn.ide_inarti,
          ide_empr: dtoIn.ideEmpr,
          rangos_incpa: !c.exacta,
          rango1_cant_incpa: c.rango1,
          rango2_cant_incpa: c.exacta || c.rango_infinito ? null : c.rango2,
          rango_infinito_incpa: !c.exacta && c.rango_infinito,
          porcentaje_util_incpa: c.modo === 'utilidad' ? c.valor : null,
          precio_fijo_incpa: c.modo === 'fijo' ? c.valor : null,
          incluye_iva_incpa: c.incluye_iva ?? false,
          activo_incpa: true,
          autorizado_incpa: true,
          ide_cncfp: c.ide_cncfp ?? null,
          ide_cndfp: null,
          observacion_incpa: (c.observacion ?? `${PREFIJO_OBSERVACION} ${new Date().toISOString().slice(0, 10)}`).slice(
            0,
            200,
          ),
        },
      } as ObjectQueryDto);
    }

    await this.core.save({ ...dtoIn, listQuery, audit: true });
    return { message: 'ok', total: listQuery.length };
  }
}
