/**
 * Extracción con IA del PDF "Comprobante de Pago" del procesador de tarjeta (ej. Bendo). Se le pasa
 * el TEXTO ya reconstruido por filas (con la rotación de la página aplicada); la IA solo tiene que
 * mapear cada columna al campo correcto. Se usa IA en vez de un parser por posición para tolerar que
 * el procesador cambie el formato (columnas, espaciado, celdas vacías); la aritmética de cada fila se
 * revalida después en el servidor.
 */

/** Fila que la IA debe devolver por cada transacción del comprobante. */
export interface TransaccionLiquidacionIa {
    numeroLiquidacion: string;
    numeroDocumento: string;
    fecha: string;
    subtotal: number;
    iva: number;
    bruto: number;
    comision: number;
    ivaComision: number;
    retRenta: number;
    retIva: number;
    neto: number;
}

export interface LiquidacionExtraidaIa {
    transacciones: TransaccionLiquidacionIa[];
}

export const PROMPT_LIQUIDACION_TARJETA = `Eres un analista contable. Recibes el TEXTO de un "Comprobante de Pago" de un procesador de
tarjetas (ej. Bendo / PUBLIPROMUEVE). El texto se reconstruyó por filas: las celdas de una misma
fila van separadas por " | ", pero a veces dos celdas quedan pegadas con un espacio y un mismo
valor puede venir partido en dos líneas.

El documento tiene una TABLA con una fila por transacción. Sus columnas, de izquierda a derecha, son:
Fecha a Depositar | Número Documento | No. Liquidación | Subtotal | % IVA | IVA | Total |
Valor Comisión | IVA Comisión | Valor Total (Comisión + IVA) | Cód. Ret. IR | % Ret. Fuente |
Ret. Fuente | Cód. Ret. IVA | % Ret. IVA | Ret. IVA | Monto Neto a pagar.

Devuelve un objeto con "transacciones": una entrada por cada fila de transacción, con estos campos:
- numeroLiquidacion: columna "No. Liquidación". Si viene partida en dos líneas, úne las partes SIN
  espacios (ej. "13174-1382026-" + "057370" => "13174-1382026-057370").
- numeroDocumento: columna "Número Documento".
- fecha: columna "Fecha a Depositar", en formato YYYY-MM-DD.
- subtotal: columna "Subtotal".
- iva: columna "IVA" (NO "% IVA").
- bruto: columna "Total".
- comision: columna "Valor Comisión".
- ivaComision: columna "IVA Comisión".
- retRenta: columna "Ret. Fuente".
- retIva: columna "Ret. IVA".
- neto: columna "Monto Neto a pagar".

Reglas:
1. Devuelve SOLO las filas de transacciones reales. NO incluyas la fila de TOTALES ni encabezados.
2. Los importes son números con punto decimal (ej. 12.55). No uses separador de miles. Si una celda
   no tiene valor, usa 0.
3. Ignora las columnas de porcentajes (% IVA, % Ret. Fuente, % Ret. IVA), los códigos de retención
   (Cód. Ret. IR, Cód. Ret. IVA) y "Valor Total (Comisión + IVA)": no se piden.
4. Autochequeo obligatorio por fila: neto = bruto − comision − ivaComision − retIva − retRenta. Si no
   cuadra, revisa qué valor asignaste mal a cada columna antes de responder.`;

/** JSON Schema estricto (Structured Outputs) de la respuesta. */
export const SCHEMA_LIQUIDACION_TARJETA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        transacciones: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    numeroLiquidacion: { type: 'string' },
                    numeroDocumento: { type: 'string' },
                    fecha: { type: 'string' },
                    subtotal: { type: 'number' },
                    iva: { type: 'number' },
                    bruto: { type: 'number' },
                    comision: { type: 'number' },
                    ivaComision: { type: 'number' },
                    retRenta: { type: 'number' },
                    retIva: { type: 'number' },
                    neto: { type: 'number' },
                },
                required: [
                    'numeroLiquidacion', 'numeroDocumento', 'fecha', 'subtotal', 'iva', 'bruto',
                    'comision', 'ivaComision', 'retRenta', 'retIva', 'neto',
                ],
            },
        },
    },
    required: ['transacciones'],
} as const;
