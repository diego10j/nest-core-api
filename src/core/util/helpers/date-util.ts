const moment = require("moment");

export class DateUtil {

    readonly FORMAT_DATE_BD: string = process.env.FORMAT_DATE_BD;
    readonly FORMAT_TIME_BD: string = process.env.FORMAT_TIME_BD;
    readonly FORMAT_DATETIME_DB: string = this.FORMAT_DATE_BD + " " + this.FORMAT_TIME_BD;
    readonly FORMAT_DATE_FRONT: string = "DD/MM/YYYY";
    readonly FORMAT_DATETIME_FRONT: string = this.FORMAT_DATE_FRONT + " " + this.FORMAT_TIME_BD;
    /**
     * Retorna la fecha actual en formato de la base de datos
     * @returns 
     */
    getCurrentDate(): string {
        return this.getDateFormat(new Date());
    }

    /**
     * Retorna la hora actual en formato de la base de datos
     * @returns 
     */
    getCurrentTime(): string {
        return this.getTimeFormat(new Date());
    }

    /**
    * Retorna la fecha-hora actual en formato de la base de datos
    * @returns 
    */
    getCurrentDateTime(): string {
        return this.getDateTimeFormat(new Date());
    }

    getDateTimeFormat(dateTime: Date, format?: string): string {
        format = this.isDefined(format) ? format : this.FORMAT_DATETIME_DB;
        return moment(dateTime).format(format);
    }

    getDateFormat(date: Date, format?: string): string {
        format = this.isDefined(format) ? format : this.FORMAT_DATE_BD;
        //console.log(date + ' ... '+ format + '  '+moment(date).format(format));
        return moment(date).format(format);
    }

    getDateFormatFront(date: Date): string {
        return moment(date).format(this.FORMAT_DATE_FRONT);
    }

    getDateTimeFormatFront(date: Date): string {
        return moment(date).format(this.FORMAT_DATETIME_FRONT);
    }

    getTimeFormat(time: Date, format?: string): string {
        format = this.isDefined(format) ? format : this.FORMAT_TIME_BD;
        //console.log(time + ' ... '+ format + '  '+moment(time).format(format));
        return moment(time).format(format);
    }

    private isDefined(value): boolean {
        return typeof value !== "undefined" && value !== null;
    }

}