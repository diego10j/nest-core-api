export class StringUtil {

    /**
     * Cuenta el numero de veces que existe un texto en una cadena String
     * @param stringSearch 
     * @param mainText 
     * @returns 
     */
    getCountStringInText(stringSearch: string, mainText: string): number {
        const count = mainText.split(stringSearch).length - 1;
        if (count < 0) {
            return 0;
        }
        return count;
    }

    /**
     * Retorna un Texto en forma de Titulo 
     * @param text 
     * @returns 
     */
    toTitleCase(text: string): string {
        return text.replace(/\w\S*/g, function (txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); });
    }

}