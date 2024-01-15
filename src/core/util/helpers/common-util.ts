

export function isDefined(value: any): boolean {
    return typeof value !== "undefined" && value !== null;
}

export function isEmpty(value: any): boolean {
    return !isDefined(value) || value === '';
}

export function toString(value: any): string {
    return (typeof value === "undefined") ? '' : value;
}

