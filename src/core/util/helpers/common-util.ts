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

