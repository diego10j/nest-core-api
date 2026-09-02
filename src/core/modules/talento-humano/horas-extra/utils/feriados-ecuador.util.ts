import { addDays, format } from 'date-fns';

export interface FeriadoGenerado {
    fecha: string; // YYYY-MM-DD
    detalle: string;
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

/**
 * Domingo de Pascua (algoritmo de Gauss/Meeus-Jones-Butcher, calendario gregoriano).
 * De ahí se derivan Carnaval y Viernes Santo, que son móviles año a año.
 */
function domingoPascua(anio: number): Date {
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(anio, mes - 1, dia);
}

/**
 * Ley Orgánica reformatoria al Código del Trabajo (R.O. 906-2S, 20-dic-2016):
 * martes -> lunes inmediato anterior; miércoles/jueves -> viernes de esa misma
 * semana; sábado -> viernes inmediato anterior; domingo -> lunes inmediato
 * siguiente. Lunes y viernes no se trasladan (son los días "ancla").
 */
function trasladar(fecha: Date): Date {
    switch (fecha.getDay()) {
        case 2: return addDays(fecha, -1); // martes -> lunes
        case 3: return addDays(fecha, 2); // miércoles -> viernes
        case 4: return addDays(fecha, 1); // jueves -> viernes
        case 6: return addDays(fecha, -1); // sábado -> viernes
        case 0: return addDays(fecha, 1); // domingo -> lunes
        default: return fecha; // lunes (1) y viernes (5): sin traslado
    }
}

/**
 * Caso especial: 2 de noviembre (Día de los Difuntos) y 3 de noviembre
 * (Independencia de Cuenca) son feriados consecutivos. Aplicar `trasladar()` a
 * cada uno por separado puede hacer que ambos caigan en la misma fecha (p. ej.
 * si el 2 cae domingo, se traslada a lunes 3 — el mismo día que Cuenca). La ley
 * los trata como una unidad de 2 días.
 *
 * Solo se resuelven aquí los dos patrones verificados contra calendarios
 * oficiales reales:
 *  - Difuntos domingo / Cuenca lunes (ej. 2025): Cuenca se queda en su lunes
 *    natural, Difuntos pasa al martes siguiente.
 *  - Difuntos lunes / Cuenca martes (ej. 2026): Difuntos se queda en su lunes
 *    natural, Cuenca se queda en su martes natural (no se traslada) porque ya
 *    forma puente con el lunes de Difuntos.
 * Para cualquier otro patrón de colisión no verificado, se devuelven ambas
 * fechas SIN trasladar (su fecha natural) y se marca el detalle para revisión
 * manual, en vez de adivinar una regla no confirmada.
 */
function difuntosYCuenca(anio: number): FeriadoGenerado[] {
    const difuntosNatural = new Date(anio, 10, 2);
    const cuencaNatural = new Date(anio, 10, 3);

    let difuntos = trasladar(difuntosNatural);
    let cuenca = trasladar(cuencaNatural);

    if (fmt(difuntos) === fmt(cuenca)) {
        if (difuntosNatural.getDay() === 0 && cuencaNatural.getDay() === 1) {
            cuenca = cuencaNatural;
            difuntos = addDays(cuenca, 1);
        } else if (difuntosNatural.getDay() === 1 && cuencaNatural.getDay() === 2) {
            difuntos = difuntosNatural;
            cuenca = cuencaNatural;
        } else {
            // Patrón de colisión no verificado contra fuente oficial: no adivinar.
            difuntos = difuntosNatural;
            cuenca = cuencaNatural;
            return [
                { fecha: fmt(difuntos), detalle: 'Día de los Difuntos (revisar traslado con fuente oficial)' },
                { fecha: fmt(cuenca), detalle: 'Independencia de Cuenca (revisar traslado con fuente oficial)' },
            ];
        }
    }

    return [
        { fecha: fmt(difuntos), detalle: 'Día de los Difuntos' },
        { fecha: fmt(cuenca), detalle: 'Independencia de Cuenca' },
    ];
}

/**
 * Calcula el calendario de feriados nacionales de Ecuador para un año, de forma
 * determinista (sin IA). Aplica la Ley de Feriados de 2016. No incluye feriados
 * cantonales/provinciales (ej. fundación de Guayaquil/Quito) ni "puentes"
 * discrecionales que a veces suma el Ejecutivo por decreto.
 * Verificado contra el calendario oficial 2026 (El Comercio, El Universo,
 * ecuadorlegalonline.com) y el caso Difuntos/Cuenca 2025 (El Universo).
 */
export function feriadosEcuadorUseCase(anio: number): FeriadoGenerado[] {
    const pascua = domingoPascua(anio);

    const feriados: FeriadoGenerado[] = [
        { fecha: fmt(new Date(anio, 0, 1)), detalle: 'Año Nuevo' },
        { fecha: fmt(addDays(pascua, -48)), detalle: 'Carnaval' },
        { fecha: fmt(addDays(pascua, -47)), detalle: 'Carnaval' },
        { fecha: fmt(addDays(pascua, -2)), detalle: 'Viernes Santo' },
        { fecha: fmt(new Date(anio, 4, 1)), detalle: 'Día del Trabajo' },
        { fecha: fmt(trasladar(new Date(anio, 4, 24))), detalle: 'Batalla de Pichincha' },
        { fecha: fmt(trasladar(new Date(anio, 7, 10))), detalle: 'Primer Grito de Independencia' },
        { fecha: fmt(trasladar(new Date(anio, 9, 9))), detalle: 'Independencia de Guayaquil' },
        ...difuntosYCuenca(anio),
        { fecha: fmt(new Date(anio, 11, 25)), detalle: 'Navidad' },
    ];

    return feriados.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
