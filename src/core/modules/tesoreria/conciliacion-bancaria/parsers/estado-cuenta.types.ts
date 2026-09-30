/** Un movimiento del estado de cuenta del banco, ya normalizado. */
export interface MovimientoBanco {
    /** YYYY-MM-DD */
    fecha: string;
    documento: string;
    descripcion: string;
    referencia: string;
    oficina: string;
    /** Siempre positivo, en dólares con 2 decimales. */
    monto: number;
    /** 1 = crédito (ingreso a la cuenta), -1 = débito (egreso). */
    signo: 1 | -1;
    /** Saldo del banco DESPUÉS del movimiento (null si el formato no lo trae). */
    saldo: number | null;
}

/** Resultado de leer un archivo del banco. `movimientos` va en orden CRONOLÓGICO ascendente. */
export interface EstadoCuentaParseado {
    /** GUAYAQUIL, PICHINCHA, PRODUBANCO, DEUNA... */
    formato: string;
    /** Número de cuenta tal como aparece en el archivo (null si el formato no lo trae). */
    cuenta: string | null;
    /** Rango declarado por el banco; si no lo declara se deduce de los movimientos. */
    fechaDesde: string | null;
    fechaHasta: string | null;
    movimientos: MovimientoBanco[];
    advertencias: string[];
}

/** Hoja de cálculo ya leída: filas de celdas con texto o número (columna 0 = A). */
export type FilaHoja = Array<string | number | null>;
