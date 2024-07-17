import { isDefined } from "./common-util";


export function getNumberFormat(value: number, decimals?: number): string {

    // console.log(new Intl.NumberFormat().format(number));
    if (!isDefined(value)) {
        value = 0;
    }
    if (isNaN(value)) {
        value = 0;
    }
    return Number(
        Math.round(parseFloat(value + 'e' + decimals)) + 'e-' + decimals
    ).toFixed(decimals);
}

