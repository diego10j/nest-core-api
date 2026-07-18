/**
 * Genera la clave de acceso de 49 dígitos para comprobantes electrónicos del SRI.
 * Implementación portada del código Java original:
 *   sigafi-ceo/src/java/dj/comprobantes/offline/service/ComprobanteServiceImp.java:109-207
 *
 * Estructura (posiciones 1-49):
 *   1-8    Fecha emisión ddMMyyyy
 *   9-10   Código tipo comprobante (01=factura, 06=guía, 04=nota crédito, 07=retención)
 *  11-23   RUC emisor (13 dígitos, padded con ceros a la izquierda)
 *  24      Ambiente (1=pruebas, 2=producción)
 *  25-30   Serie = establecimiento(3) + punto emisión(3)
 *  31-39   Secuencial (9 dígitos, padded)
 *  40-47   Código numérico = yyyy (4 dígitos del año) + HHmm (hora actual)
 *  48      Tipo emisión (1=normal)
 *  49      Dígito verificador módulo 11
 */

export interface ClaveAccesoParams {
    fechaEmision: string;   // YYYY-MM-DD
    codDoc: string;         // '01' = factura, '06' = guía
    rucEmisor: string;      // RUC del emisor (13 dígitos)
    ambiente: string;       // '1' = pruebas, '2' = producción
    estab: string;          // 3 dígitos
    ptoEmi: string;         // 3 dígitos
    secuencial: string;     // hasta 9 dígitos, se aplica padding
    tipoEmision: string;    // '1' = normal
}

export function generarClaveAcceso(params: ClaveAccesoParams): string {
    const fecha = params.fechaEmision.replace(/-/g, '');
    const ddMMyyyy = fecha.slice(6, 8) + fecha.slice(4, 6) + fecha.slice(0, 4);

    const rucPadded = params.rucEmisor.padStart(13, '0').slice(0, 13);

    const serie = (params.estab + params.ptoEmi).slice(0, 6);

    const secuencial = params.secuencial.padStart(9, '0').slice(0, 9);

    // Java: fechaEmision.substring(4) = yyyy + HHmm (hora actual del sistema, 4 dígitos)
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const codigoNumerico = ddMMyyyy.slice(4, 8) + hh + mm;

    const claveSinDigito = ddMMyyyy
        + params.codDoc
        + rucPadded
        + params.ambiente
        + serie
        + secuencial
        + codigoNumerico
        + params.tipoEmision;

    const digito = modulo11(claveSinDigito);
    const clave = claveSinDigito + String(digito);

    if (clave.length !== 49) {
        throw new Error(`La clave de acceso generada tiene ${clave.length} dígitos, se esperaban 49.`);
    }
    return clave;
}

/**
 * Calcula el dígito verificador por módulo 11 según algoritmo SRI.
 * Recorre la cadena de derecha a izquierda con multiplicador cíclico 2→7.
 * Casos borde: total=0 o 1 → 0; verificador=10 → 1; verificador=11 → 0.
 */
function modulo11(clave48: string): number {
    let multiplicador = 2;
    let total = 0;

    for (let i = clave48.length - 1; i >= 0; i--) {
        total += Number(clave48[i]) * multiplicador;
        multiplicador = multiplicador + 1 > 7 ? 2 : multiplicador + 1;
    }

    if (total === 0 || total === 1) return 0;

    const verificador = 11 - (total % 11);
    if (verificador === 11) return 0;
    if (verificador === 10) return 1;
    return verificador;
}
