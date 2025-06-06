import { envs } from "src/config/envs";

export const HOST_API = (): string => envs.hostApi;

export function isEmpty(value: any): boolean {
    return !isDefined(value) || value === '';
}

export function toString(value: any): string {
    return (typeof value === "undefined") ? '' : value;
}


/**
 * Verifica si un valor esta definido
 * @param value 
 * @returns 
 */
export function isDefined(value): boolean {
    return typeof value !== "undefined" && value !== null;
}

/**
 * Valida columnas requeridas de un objeto data 
 * @param data  {}
 * @param columns  
 * @returns 
 */
export function validateDataRequiere(data: any, columns: string[]): string[] {
    const errors: string[] = [];
    columns.forEach((column) => {
        if (column) {
            const value = data[column];
            if (value === "" || value === undefined || value === null) {
                errors.push(`El campo ${column} es requerido.`);
            }
        }
    });
    return errors;
}