export declare class DateUtil {
    readonly FORMAT_DATE_BD: string;
    readonly FORMAT_TIME_BD: string;
    readonly FORMAT_DATETIME_DB: string;
    readonly FORMAT_DATE_FRONT: string;
    getCurrentDate(): string;
    getCurrentTime(): string;
    getCurrentDateTime(): string;
    getDateTimeFormat(dateTime: Date, format?: string): string;
    getDateFormat(date: Date, format?: string): string;
    getDateFormatFront(date: Date): string;
    getTimeFormat(time: Date, format?: string): string;
    private isDefined;
}
