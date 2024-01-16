import { toString } from './common-util';
import { parse, format, getTime, addDays, isValid, formatDistanceToNow } from 'date-fns';



export const FORMAT_DATE_BD = (): string => process.env.FORMAT_DATE_BD;  // yyyy-MM-dd
export const FORMAT_TIME_BD = (): string => process.env.FORMAT_TIME_BD;
export const FORMAT_DATETIME_DB = (): string => process.env.FORMAT_DATE_BD + " " + process.env.FORMAT_TIME_BD;
export const FORMAT_DATE_FRONT = (): string => "dd/MM/yyyy";
export const FORMAT_DATETIME_FRONT = (): string => FORMAT_DATE_FRONT + " " + FORMAT_TIME_BD;


// getDateTimeFormatFront, getTimeFormat


// ----------------------------------------------------------------------

type InputValue = Date | string | number | null | undefined;

export function fDate(date: InputValue, newFormat?: string) {
    const fm = newFormat || 'dd MMM yyyy';

    return date ? format(new Date(date), fm) : '';
}

export function fTime(date: InputValue, newFormat?: string) {
    const fm = newFormat || 'p';

    return date ? format(new Date(date), fm) : '';
}

export function fDateTime(date: InputValue, newFormat?: string) {
    const fm = newFormat || 'dd MMM yyyy p';

    return date ? format(new Date(date), fm) : '';
}

export function fTimestamp(date: InputValue) {
    return date ? getTime(new Date(date)) : '';
}

export function fToNow(date: InputValue) {
    return date
        ? formatDistanceToNow(new Date(date), {
            addSuffix: true,
        })
        : '';
}

export function isBetween(inputDate: Date | string | number, startDate: Date, endDate: Date) {
    const date = new Date(inputDate);

    const results =
        new Date(date.toDateString()) >= new Date(startDate.toDateString()) &&
        new Date(date.toDateString()) <= new Date(endDate.toDateString());

    return results;
}

export function isAfter(startDate: Date | null, endDate: Date | null) {
    const results =
        startDate && endDate ? new Date(startDate).getTime() > new Date(endDate).getTime() : false;

    return results;
}



export function getTimeFormat(time: InputValue, newFormat?: string): string {

    const fm = newFormat || FORMAT_TIME_BD();
    return time ? format(new Date(time), fm) : '';

}

export function getDateTimeFormatFront(date: InputValue, newFormat?: string): string {
    const fm = newFormat || FORMAT_DATETIME_FRONT();
    return date ? format(new Date(date), fm) : '';
}


/**
 * Convierte una fecha en string a Objeto Date
 * @param date
 * @param newFormat
 * @returns
 */
export function toDate(date: string, newFormat?: string): Date {
    const fm = newFormat || FORMAT_DATE_BD();
    return parse(date, toString(fm), new Date());
}

/**
 * Da formato a una Fecha
 * @param date
 * @param newFormat
 * @returns
 */
export function getDateFormat(date: InputValue, newFormat?: string): string {
    const fm = newFormat || FORMAT_DATE_BD();
    return date ? format(new Date(date), fm) : '';
}




export function getDateFormatFront(date: InputValue): string {
    return getDateFormat(date, FORMAT_DATE_FRONT());
}


/**
 * Suma días a una Fecha
 * @param date
 * @param numDays
 * @param newFormat
 * @returns
 */
export function addDaysDate(date: Date, numDays: number, newFormat?: string): Date {
    const fm = newFormat || FORMAT_DATE_BD();
    return addDays(toDate(getDateFormat(date, fm)), numDays);
}

export function isValidDate(date: any): boolean {
    return isValid(date);
}


/**
 * Retorna la fecha actual en formato de la base de datos
 * @returns 
 */
export function getCurrentDate(newFormat?: string): string {
    return getDateFormat(new Date(), newFormat);
}

/**
 * Retorna la hora actual en formato de la base de datos
 * @returns 
 */
export function getCurrentTime(newFormat?: string): string {
    return getTimeFormat(new Date(), newFormat);
}
