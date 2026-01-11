import { parse, format, getTime, isValid, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { envs } from 'src/config/envs';

import { toString } from './common-util';
import { f_to_title_case } from './string-util';

export const FORMAT_DATE_BD = (): string => envs.formatDateBd; // yyyy-MM-dd
export const FORMAT_TIME_BD = (): string => envs.formatTimeBd;
export const FORMAT_DATETIME_DB = (): string => envs.formatDateBd + ' ' + envs.formatTimeBd;
export const FORMAT_DATE_FRONT = (): string => 'dd/MM/yyyy';
export const FORMAT_DATETIME_FRONT = (): string => 'dd/MM/yyyy HH:mm:ss';

// getDateTimeFormatFront, getTimeFormat

// sudo timedatectl set-timezone America/Guayaquil
// ----------------------------------------------------------------------

type InputValue = Date | string | number | null | undefined;

export function fDate(date: InputValue, newFormat?: string) {
  const fm = newFormat || 'dd MMM yyyy'; // dd MMM yyyy

  return date ? f_to_title_case(format(new Date(date), fm, { locale: es })) : '';
}

/**
 * Retorna una fecha en formato corto
 * @param date
 * @returns   Ene 2024
 */
export function fShortDate(date: InputValue) {
  const fm = 'MMM yyyy';
  return date ? f_to_title_case(format(new Date(date), fm, { locale: es })) : '';
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
  const results = startDate && endDate ? new Date(startDate).getTime() > new Date(endDate).getTime() : false;

  return results;
}

export function getTimeFormat(time: InputValue, newFormat?: string): string {
  const fm = newFormat || FORMAT_TIME_BD();
  return time ? format(new Date(time), fm) : '';
}

export function getTimeISOFormat(stringValue: string): string | null {
  if (!stringValue) return null; // Manejar casos nulos o vacíos
  // Convertir el string TIME en un objeto Date
  const [hours, minutes, seconds] = stringValue.split(':').map(Number);
  return `1989-07-11T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getDateTimeFormatFront(date: InputValue, newFormat?: string): string {
  const fm = newFormat || FORMAT_DATETIME_FRONT();
  return date ? format(new Date(date), fm) : '';
}

export function getDateTimeFormat(date: InputValue, newFormat?: string): string {
  const fm = newFormat || FORMAT_DATETIME_DB();
  return date ? format(new Date(date), fm) : '';
}

/**
 * Convierte una fecha en string a Objeto Date
 * @param date
 * @param newFormat
 * @returns
 */
export function toDate(date: string, newFormat?: string): Date {
  if (date) {
    const fm = newFormat || FORMAT_DATE_BD();
    return parse(date, toString(fm), new Date());
  }
  return null;
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

export function getDateFormatFront(date: InputValue, forSQL: boolean = false): string {
  if (!date) return '';

  const dateObj = new Date(date);

  if (forSQL) {
    // Para SQL: formato YYYY-MM-DD
    return dateObj.toISOString().split('T')[0];
  } else {
    // Para frontend: formato dd/MM/yyyy
    return getDateFormat(date, FORMAT_DATE_FRONT());
  }
}

/**
 * Suma días a una Fecha
 * @param date
 * @param numDays
 * @param newFormat
 * @returns
 */
export function addDaysDate(date: Date | string, numDays: number, newFormat?: string): Date {
  // Primero convertir a Date si es string
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Crear copia para no modificar el original
  const result = new Date(dateObj);

  // Sumar/restar los días directamente
  result.setDate(result.getDate() + numDays);

  // Si se necesita formatear, hacerlo al final
  if (newFormat) {
    return new Date(getDateFormat(result, newFormat));
  }

  return result;
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

export function getCurrentDateTime(newFormat?: string): string {
  return getDateTimeFormat(new Date(), newFormat);
}

export function getDayNumber(date?: InputValue): number {
  const day = format(new Date(date || new Date()), 'i');
  return parseInt(day, 10);
}

/**
 * Convierte un timestamp de WhatsApp (segundos) a formato ISO string
 * @param timestamp - Timestamp en segundos (ej: 1743007866)
 * @returns Fecha en formato ISO string (ej: "2025-02-08T23:23:51.471Z")
 */
export function fTimestampToISODate(timestamp: number): string {
  if (timestamp) {
    // Verificar si el timestamp está en segundos (WhatsApp) o milisegundos
    const adjustedTimestamp = timestamp > 1e10 ? timestamp : timestamp * 1000;

    const date = new Date(adjustedTimestamp);

    // Formatear a ISO string y asegurar milisegundos (3 dígitos)
    const isoString = date.toISOString();

    return isoString;
  }
}
