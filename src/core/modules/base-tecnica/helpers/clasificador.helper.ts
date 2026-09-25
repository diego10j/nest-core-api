import { TipoDocumentoBdt } from '../constants/base-tecnica.constants';

import { normalizarTexto } from './normalizar.helper';

export interface ClasificacionReglas {
  tipo: TipoDocumentoBdt | null;
  /** 0..1 — qué tan claro fue el patrón (1 = título explícito en la primera página). */
  certeza: number;
  puntajes: Record<string, number>;
}

// Frases por tipo (normalizadas: mayúsculas sin tildes). Las del título pesan más que las del
// cuerpo porque un COA puede mencionar "specification" y una ficha técnica "safety".
const TITULOS: Record<TipoDocumentoBdt, string[]> = {
  HOJA_SEGURIDAD: [
    'SAFETY DATA SHEET',
    'MATERIAL SAFETY DATA SHEET',
    'HOJA DE DATOS DE SEGURIDAD',
    'HOJA DE SEGURIDAD',
    'FICHA DE DATOS DE SEGURIDAD',
    'FICHA DE SEGURIDAD',
    'MSDS',
    'SDS',
  ],
  CERTIFICADO_ANALISIS: [
    'CERTIFICATE OF ANALYSIS',
    'CERTIFICADO DE ANALISIS',
    'CERTIFICADO DE CALIDAD',
    'CERTIFICATE OF QUALITY',
    'ANALYSIS CERTIFICATE',
    'COA',
  ],
  FICHA_TECNICA: [
    'TECHNICAL DATA SHEET',
    'TECHNICAL INFORMATION',
    'PRODUCT DATA SHEET',
    'PRODUCT SPECIFICATION',
    'SPECIFICATION SHEET',
    'FICHA TECNICA',
    'HOJA TECNICA',
    'ESPECIFICACION DE PRODUCTO',
    'TDS',
  ],
  OTRO: [],
};

const CUERPO: Record<TipoDocumentoBdt, string[]> = {
  HOJA_SEGURIDAD: [
    'FIRST AID MEASURES',
    'PRIMEROS AUXILIOS',
    'HAZARD IDENTIFICATION',
    'IDENTIFICACION DE LOS PELIGROS',
    'IDENTIFICACION DE RIESGOS',
    'FIRE-FIGHTING MEASURES',
    'EXTINCION DE INCENDIOS',
    'ACCIDENTAL RELEASE',
    'EXPOSURE CONTROLS',
    'PROTECCION PERSONAL',
    'TRANSPORT INFORMATION',
    'INFORMACION RELATIVA AL TRANSPORTE',
    'TOXICOLOGICAL INFORMATION',
    'INFORMACION TOXICOLOGICA',
    'DISPOSAL CONSIDERATIONS',
  ],
  CERTIFICADO_ANALISIS: [
    'BATCH NO',
    'LOT NO',
    'LOTE:',
    'LOTE N',
    'DATE OF ANALYSIS',
    'FECHA DE ANALISIS',
    'FECHA DE ELABORACION',
    'MANUFACTURING DATE',
    'EXPIRY DATE',
    'FECHA DE VENCIMIENTO',
    'RESULT',
    'RESULTADO',
    'CONFORME',
    'COMPLIES',
    'CONFORMS',
    'PASS',
  ],
  FICHA_TECNICA: [
    'TYPICAL PROPERTIES',
    'PROPIEDADES TIPICAS',
    'APPLICATION',
    'APLICACIONES',
    'RECOMMENDED USE',
    'DOSAGE',
    'DOSIFICACION',
    'SHELF LIFE',
    'VIDA UTIL',
    'PACKAGING',
    'PRESENTACION',
    'INCI NAME',
    'PRODUCT DESCRIPTION',
  ],
  OTRO: [],
};

function contiene(texto: string, frase: string): boolean {
  // Siglas cortas (SDS, COA, TDS) solo como palabra completa.
  if (frase.length <= 4) return new RegExp(`\\b${frase}\\b`).test(texto);
  return texto.includes(frase);
}

/**
 * Clasificación gratuita por palabras clave, antes de la IA. No decide sola: se envía como pista
 * a la extracción y, si la IA no coincide con una regla de certeza alta, el documento va a REVISION.
 */
export function clasificarPorReglas(textoPrimeraPagina: string, textoCompleto: string, nombreArchivo: string): ClasificacionReglas {
  const cabecera = normalizarTexto(`${nombreArchivo}\n${textoPrimeraPagina.slice(0, 1500)}`);
  const cuerpo = normalizarTexto(textoCompleto.slice(0, 20000));
  const puntajes: Record<string, number> = {};

  for (const tipo of ['HOJA_SEGURIDAD', 'CERTIFICADO_ANALISIS', 'FICHA_TECNICA'] as TipoDocumentoBdt[]) {
    const enTitulo = TITULOS[tipo].filter((f) => contiene(cabecera, f)).length;
    const enCuerpo = CUERPO[tipo].filter((f) => contiene(cuerpo, f)).length;
    puntajes[tipo] = enTitulo * 5 + enCuerpo;
  }

  const orden = Object.entries(puntajes).sort((a, b) => b[1] - a[1]);
  const [primero, segundo] = orden;
  if (!primero || primero[1] === 0) return { tipo: null, certeza: 0, puntajes };

  const ventaja = primero[1] - (segundo?.[1] ?? 0);
  const certeza = Math.min(1, ventaja / 8);
  return { tipo: primero[0] as TipoDocumentoBdt, certeza, puntajes };
}
