import JSZip from 'jszip';

import type { FilaHoja } from './estado-cuenta.types';

/**
 * Lector mínimo de .xlsx (primera hoja con datos) sobre jszip. Se escribió a mano porque los
 * Excel de los bancos rompen a los lectores comunes: el de Produbanco usa el prefijo `x:` en todos
 * los elementos, declara mal su rango (`dimension`) y sus celdas de datos no traen la coordenada
 * `r` (la columna es la posición dentro de la fila). Aquí nada depende de `dimension` ni de `r`.
 *
 * Devuelve las filas con datos (las vacías se omiten). Cada celda es texto, número o null; las
 * fechas se entregan como vengan (texto o serial numérico) y las interpreta cada parser.
 */

const decodificarXml = (s: string): string => s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

const atributo = (atributos: string, nombre: string): string | null => {
    const m = new RegExp(`(?:^|\\s)(?:\\w+:)?${nombre}="([^"]*)"`).exec(atributos);
    return m ? decodificarXml(m[1]) : null;
};

/** Texto de todos los <t> de un fragmento (un <si> o un <is>), ignorando los <t/> vacíos. */
const textoDeFragmento = (xml: string): string => {
    const sinVacios = xml.replace(/<(?:\w+:)?t\b[^>]*\/>/g, '');
    let salida = '';
    for (const m of sinVacios.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)) salida += m[1];
    return decodificarXml(salida);
};

/** "AB12" -> 27 (índice 0-based de la columna). */
const indiceColumna = (referencia: string): number => {
    const letras = /^[A-Za-z]+/.exec(referencia)?.[0].toUpperCase() ?? '';
    let n = 0;
    for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
    return n - 1;
};

async function leerTexto(zip: JSZip, ruta: string): Promise<string | null> {
    const archivo = zip.file(ruta);
    return archivo ? archivo.async('string') : null;
}

/** Ruta (dentro del zip) de la primera hoja declarada en workbook.xml, o la primera sheetN.xml. */
async function rutasHojas(zip: JSZip): Promise<string[]> {
    const libro = await leerTexto(zip, 'xl/workbook.xml');
    const rels = await leerTexto(zip, 'xl/_rels/workbook.xml.rels');
    const rutas: string[] = [];
    if (libro && rels) {
        const destinos = new Map<string, string>();
        for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
            const id = atributo(m[1], 'Id');
            const destino = atributo(m[1], 'Target');
            if (id && destino) destinos.set(id, destino.replace(/^\/?(?:xl\/)?/, 'xl/'));
        }
        for (const m of libro.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
            const rid = atributo(m[1], 'id');
            const destino = rid ? destinos.get(rid) : undefined;
            if (destino) rutas.push(destino);
        }
    }
    if (rutas.length === 0) {
        Object.keys(zip.files)
            .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
            .sort()
            .forEach((n) => rutas.push(n));
    }
    return rutas;
}

async function leerCompartidas(zip: JSZip): Promise<string[]> {
    const xml = await leerTexto(zip, 'xl/sharedStrings.xml');
    if (!xml) return [];
    return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textoDeFragmento(m[1]));
}

function leerFilas(xmlHoja: string, compartidas: string[]): FilaHoja[] {
    const filas: FilaHoja[] = [];
    for (const filaXml of xmlHoja.matchAll(/<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
        const cuerpo = filaXml[1] ?? '';
        const fila: FilaHoja = [];
        let siguiente = 0;
        for (const c of cuerpo.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
            const atributos = c[1];
            const contenido = c[2] ?? '';
            const ref = atributo(atributos, 'r');
            const columna = ref ? indiceColumna(ref) : siguiente;
            siguiente = columna + 1;

            const tipo = atributo(atributos, 't');
            const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(contenido)?.[1];
            let valor: string | number | null = null;
            if (tipo === 'inlineStr') {
                valor = textoDeFragmento(contenido);
            } else if (v !== undefined) {
                if (tipo === 's') valor = compartidas[Number(v)] ?? null;
                else if (tipo === 'str') valor = decodificarXml(v);
                else if (tipo === 'b') valor = v === '1' ? 1 : 0;
                else if (tipo === 'e') valor = null;
                else valor = v === '' ? null : Number(v);
            }
            while (fila.length < columna) fila.push(null);
            fila[columna] = valor;
        }
        if (fila.some((celda) => celda !== null && celda !== '')) filas.push(fila);
    }
    return filas;
}

/** Filas de la primera hoja que tenga datos. */
export async function leerPrimeraHojaXlsx(buffer: Buffer): Promise<FilaHoja[]> {
    const zip = await JSZip.loadAsync(buffer);
    const compartidas = await leerCompartidas(zip);
    for (const ruta of await rutasHojas(zip)) {
        const xml = await leerTexto(zip, ruta);
        if (!xml) continue;
        const filas = leerFilas(xml, compartidas);
        if (filas.length > 0) return filas;
    }
    return [];
}
