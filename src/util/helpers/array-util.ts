

/**
 * Elimina elementos repetidos en un array
 * @param data 
 * @returns 
 */
export function removeEqualsElements(data: any[]): any[] {
    return data.filter((item, index) => {
        return data.indexOf(item) === index;
    });
}
