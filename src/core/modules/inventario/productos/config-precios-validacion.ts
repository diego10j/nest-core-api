import type { ConfigPrecioPropuesta } from './config-precios-ia.service';

import { Linea, margenLinea, margenPonderado, mediana, percentil, r2, r4 } from './config-precios-ia.utils';

/**
 * Validador de la configuración de precios que ya existe: la contrasta con lo que dicen las facturas del período y
 * con lo que propone la IA, y para cada configuración sugiere MANTENER, MODIFICAR o ELIMINAR (y CREAR las que falten).
 * Todo se calcula aquí con los datos reales; ninguna cifra la inventa el modelo.
 */

/** Configuración vigente (activa) de un producto, tal como está guardada. */
export type ConfigExistente = {
  ide_incpa: number;
  ide_cncfp: number | null;
  nombre_cncfp: string | null;
  ide_cndfp: number | null;
  nombre_cndfp: string | null;
  rangos: boolean;
  rango1: number | null;
  rango2: number | null;
  infinito: boolean;
  precio_fijo: number | null;
  porcentaje: number | null;
  incluye_iva: boolean;
  autorizado: boolean;
  observacion: string | null;
};

export type AccionValidacion = 'MANTENER' | 'MODIFICAR' | 'ELIMINAR' | 'CREAR' | 'SIN_DATOS';

export type ItemValidacion = {
  accion: AccionValidacion;
  /** Configuración actual (null en CREAR). */
  existente: {
    ide_incpa: number;
    nombre_cncfp: string;
    nombre_cndfp: string | null;
    exacta: boolean;
    rango1: number;
    rango2: number | null;
    rango_infinito: boolean;
    modo: 'utilidad' | 'fijo';
    /** % de utilidad o precio guardado (tal como está en la tabla). */
    valor: number;
    incluye_iva: boolean;
    autorizado: boolean;
    /** Creada a mano (no por el generador automático / IA). */
    manual: boolean;
    /** % de utilidad sobre el costo de hoy y precio sin IVA que resulta hoy. */
    utilidad_pct: number | null;
    precio_sin_iva: number | null;
  } | null;
  /** Valor sugerido (MODIFICAR y CREAR): mismo alcance que la actual, con el valor y tipo propuestos. */
  sugerida: ConfigPrecioPropuesta | null;
  /** Lo que muestran las ventas del período dentro del alcance de la configuración actual. */
  ventas: number;
  coherencia: number | null;
  margen_observado: number | null;
  precio_observado: number | null;
  motivo: string;
};

export type ResultadoValidacion = {
  existentes: number;
  resumen: Record<AccionValidacion, number>;
  items: ItemValidacion[];
};

/** Diferencia de utilidad (puntos) y de precio fijo (relativa) que se considera "lo mismo". */
const TOLERANCIA_UTILIDAD = 2;
const TOLERANCIA_PRECIO_FIJO = 0.02;
/** % de las ventas del alcance que debe coincidir con la configuración para darla por buena. */
const COHERENCIA_MINIMA = 70;

type Alcance = { exacta: boolean; desde: number; hasta: number | null };

const alcanceDe = (e: ConfigExistente): Alcance => {
  if (!e.rangos && e.rango1 !== null && e.rango1 !== undefined) {
    return { exacta: true, desde: Number(e.rango1), hasta: null };
  }
  return { exacta: false, desde: Number(e.rango1 ?? 0), hasta: e.infinito ? null : (e.rango2 ?? null) };
};

type Entrada = {
  existentes: ConfigExistente[];
  propuestas: ConfigPrecioPropuesta[];
  validas: Linea[];
  costoActual: number;
  tarifaIva: number | undefined;
  paso: number;
};

export function evaluarConfiguraciones({
  existentes,
  propuestas,
  validas,
  costoActual: costo,
  tarifaIva: iva,
  paso,
}: Entrada): ResultadoValidacion {
  const mitad = paso / 2;
  const items: ItemValidacion[] = [];
  const usadas = new Set<ConfigPrecioPropuesta>();
  /** Rangos existentes que se conservan: la IA no debe volver a crear algo que se solape con ellos. */
  const conservadas: { tipo: number | null; alcance: Alcance }[] = [];

  const solapan = (a: Alcance, b: Alcance) =>
    a.desde <= (b.hasta ?? Infinity) + mitad && b.desde <= (a.hasta ?? Infinity) + mitad;

  const enAlcance = (l: Linea, a: Alcance) =>
    a.exacta
      ? Math.abs(l.cantidad - a.desde) < mitad
      : l.cantidad >= a.desde - mitad && (a.hasta === null || l.cantidad <= a.hasta + mitad);

  const mismoAlcance = (e: ConfigExistente, a: Alcance, p: ConfigPrecioPropuesta) =>
    e.ide_cndfp === null &&
    e.ide_cncfp === p.ide_cncfp &&
    a.exacta === p.exacta &&
    Math.abs(a.desde - p.rango1) <= paso * 1.01 &&
    (p.exacta ||
      ((a.hasta === null) === p.rango_infinito &&
        (a.hasta === null || Math.abs(a.hasta - (p.rango2 ?? 0)) <= paso * 1.5)));

  const alcanceDeP = (p: ConfigPrecioPropuesta): Alcance => ({
    exacta: p.exacta,
    desde: p.rango1,
    hasta: p.exacta ? null : p.rango2,
  });

  for (const e of existentes) {
    const al = alcanceDe(e);
    const modo: 'utilidad' | 'fijo' = e.precio_fijo !== null && e.precio_fijo !== undefined ? 'fijo' : 'utilidad';
    const guardado = modo === 'fijo' ? Number(e.precio_fijo) : Number(e.porcentaje ?? 0);
    const sinIvaGuardado = modo === 'fijo' ? (e.incluye_iva ? guardado / (1 + (iva ?? 0)) : guardado) : null;
    const utilidad =
      modo === 'fijo' ? (costo > 0 ? r2((((sinIvaGuardado as number) - costo) / costo) * 100) : null) : guardado;
    const sinIva = modo === 'fijo' ? r4(sinIvaGuardado as number) : costo > 0 ? r4(costo * (1 + guardado / 100)) : null;

    const existente: NonNullable<ItemValidacion['existente']> = {
      ide_incpa: e.ide_incpa,
      nombre_cncfp: e.nombre_cncfp ?? 'Cualquier forma de pago',
      nombre_cndfp: e.nombre_cndfp,
      exacta: al.exacta,
      rango1: al.desde,
      rango2: al.hasta,
      rango_infinito: !al.exacta && al.hasta === null,
      modo,
      valor: guardado,
      incluye_iva: e.incluye_iva,
      autorizado: e.autorizado,
      manual: !/^(Config IA|Config autom)/i.test(e.observacion ?? ''),
      utilidad_pct: utilidad,
      precio_sin_iva: sinIva,
    };

    // Las cantidades exactas tienen prioridad: las ventas de esas cantidades no cuentan para los rangos
    const exactas = existentes
      .filter((x) => x.ide_incpa !== e.ide_incpa && x.ide_cncfp === e.ide_cncfp && alcanceDe(x).exacta)
      .map((x) => alcanceDe(x).desde);
    const ls = validas.filter(
      (l) =>
        (e.ide_cncfp === null || l.tipo === e.ide_cncfp) &&
        (e.ide_cndfp === null || l.ideMedio === e.ide_cndfp) &&
        enAlcance(l, al) &&
        (al.exacta || !exactas.some((q) => Math.abs(l.cantidad - q) < mitad)),
    );

    const par = propuestas.find((p) => mismoAlcance(e, al, p));
    if (par) usadas.add(par);

    if (ls.length === 0) {
      conservadas.push({ tipo: e.ide_cncfp, alcance: al });
      items.push({
        accion: 'SIN_DATOS',
        existente,
        sugerida: null,
        ventas: 0,
        coherencia: null,
        margen_observado: null,
        precio_observado: null,
        motivo: 'No hubo ventas en este alcance durante el período: no hay datos para validarla, se conserva.',
      });
      continue;
    }

    const margen = margenPonderado(ls);
    const precios = ls.map((l) => l.precio);
    const precioMed = mediana(precios);
    const aciertos =
      modo === 'fijo'
        ? ls.filter((l) => Math.abs(l.precio - (sinIvaGuardado as number)) / (sinIvaGuardado as number) <= 0.015)
        : ls.filter((l) => Math.abs(margenLinea(l) - guardado) <= 5);
    const coherencia = Math.round((aciertos.length / ls.length) * 100);
    const base = {
      existente,
      ventas: ls.length,
      coherencia,
      margen_observado: r2(margen),
      precio_observado: r4(precioMed),
    };
    const texto = `${ls.length} venta${ls.length === 1 ? '' : 's'}, margen típico ${r2(margen)} %, consistencia con la actual ${coherencia} %`;

    if (par) {
      const mismaUtilidad =
        utilidad !== null
          ? Math.abs(utilidad - par.utilidad_pct) <= TOLERANCIA_UTILIDAD
          : sinIva !== null && par.precio_hoy !== null && Math.abs(sinIva - par.precio_hoy) / par.precio_hoy <= 0.02;
      const mismoPrecioFijo =
        modo === 'fijo' && par.modo === 'fijo'
          ? Math.abs((sinIvaGuardado as number) - par.valor) / par.valor <= TOLERANCIA_PRECIO_FIJO
          : true;
      if (mismaUtilidad && mismoPrecioFijo) {
        conservadas.push({ tipo: e.ide_cncfp, alcance: al });
        items.push({
          ...base,
          accion: 'MANTENER',
          sugerida: null,
          motivo: `Coincide con lo que muestran las ventas (${texto}).`,
        });
      } else {
        items.push({
          ...base,
          accion: 'MODIFICAR',
          sugerida: par,
          motivo:
            par.modo === 'fijo'
              ? `Las ventas se hicieron a un precio de ${r2(par.valor)} sin IVA y la actual da ${sinIva !== null ? r2(sinIva) : 's/d'} (${texto}).`
              : `La actual deja ${utilidad !== null ? `${utilidad} %` : 'una utilidad que no se puede calcular'} y las ventas muestran ${par.utilidad_pct} % (${texto}).`,
        });
      }
      continue;
    }

    // Sin escalón equivalente en la propuesta de la IA
    if (coherencia >= COHERENCIA_MINIMA) {
      conservadas.push({ tipo: e.ide_cncfp, alcance: al });
      items.push({
        ...base,
        accion: 'MANTENER',
        sugerida: null,
        motivo: `La IA no la propuso como escalón, pero refleja las ventas (${texto}).`,
      });
      continue;
    }

    const solapadas = propuestas.filter(
      (p) => !usadas.has(p) && !p.exacta && !al.exacta && p.ide_cncfp === e.ide_cncfp && solapan(al, alcanceDeP(p)),
    );
    if (solapadas.length > 0) {
      items.push({
        ...base,
        accion: 'ELIMINAR',
        sugerida: null,
        motivo: `No refleja las ventas (${texto}) y la IA propone otros escalones para este rango: se reemplaza por ellos.`,
      });
      continue;
    }

    const margenes = ls.map(margenLinea);
    const sugerida: ConfigPrecioPropuesta = {
      ide_cncfp: e.ide_cncfp,
      nombre_cncfp: existente.nombre_cncfp,
      rango1: al.desde,
      rango2: al.hasta,
      rango_infinito: existente.rango_infinito,
      exacta: al.exacta,
      modo: 'utilidad',
      valor: r2(margen),
      utilidad_pct: r2(margen),
      precio_hoy: costo > 0 ? r4(costo * (1 + margen / 100)) : null,
      ventas: ls.length,
      coherencia: Math.round((ls.filter((l) => Math.abs(margenLinea(l) - margen) <= 5).length / ls.length) * 100),
      margen_min: r2(percentil(margenes, 0.1)),
      margen_max: r2(percentil(margenes, 0.9)),
      precio_min: r4(percentil(precios, 0.1)),
      precio_max: r4(percentil(precios, 0.9)),
      razon: 'Margen típico observado en las ventas de este alcance',
      sugerida: true,
      motivo: null,
    };
    items.push({
      ...base,
      accion: 'MODIFICAR',
      sugerida,
      motivo: `No refleja las ventas (${texto}): se sugiere ajustarla al margen típico observado.`,
    });
  }

  // Escalones que la IA propone y que la configuración actual no tiene
  for (const p of propuestas) {
    if (usadas.has(p)) continue;
    const ap = alcanceDeP(p);
    const cubierta =
      !p.exacta && conservadas.some((c) => c.tipo === p.ide_cncfp && !c.alcance.exacta && solapan(c.alcance, ap));
    if (cubierta) continue;
    items.push({
      accion: 'CREAR',
      existente: null,
      sugerida: p,
      ventas: p.ventas,
      coherencia: p.coherencia,
      margen_observado: null,
      precio_observado: null,
      motivo: p.exacta
        ? 'Cantidad con precio estándar que hoy no tiene su propia configuración.'
        : 'Escalón de cantidad que muestran las ventas y que hoy no está configurado.',
    });
  }

  const alcanceItem = (i: ItemValidacion) => {
    const x = i.existente ?? i.sugerida;
    return {
      tipo: x ? (i.existente ? i.existente.nombre_cncfp : (i.sugerida as ConfigPrecioPropuesta).nombre_cncfp) : '',
      exacta: x ? x.exacta : false,
      desde: x ? x.rango1 : 0,
    };
  };
  items.sort((a, b) => {
    const x = alcanceItem(a);
    const y = alcanceItem(b);
    return x.tipo.localeCompare(y.tipo) || Number(y.exacta) - Number(x.exacta) || x.desde - y.desde;
  });

  const resumen: Record<AccionValidacion, number> = { MANTENER: 0, MODIFICAR: 0, ELIMINAR: 0, CREAR: 0, SIN_DATOS: 0 };
  items.forEach((i) => {
    resumen[i.accion] += 1;
  });
  return { existentes: existentes.length, resumen, items };
}
