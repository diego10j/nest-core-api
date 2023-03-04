"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateUtil = void 0;
const moment = require("moment");
class DateUtil {
    constructor() {
        this.FORMAT_DATE_BD = process.env.FORMAT_DATE_BD;
        this.FORMAT_TIME_BD = process.env.FORMAT_TIME_BD;
        this.FORMAT_DATETIME_DB = this.FORMAT_DATE_BD + " " + this.FORMAT_TIME_BD;
        this.FORMAT_DATE_FRONT = "DD/MM/YYYY";
    }
    getCurrentDate() {
        return this.getDateFormat(new Date());
    }
    getCurrentTime() {
        return this.getTimeFormat(new Date());
    }
    getCurrentDateTime() {
        return this.getDateTimeFormat(new Date());
    }
    getDateTimeFormat(dateTime, format) {
        format = this.isDefined(format) ? format : this.FORMAT_DATETIME_DB;
        return moment(dateTime).format(format);
    }
    getDateFormat(date, format) {
        format = this.isDefined(format) ? format : this.FORMAT_DATE_BD;
        return moment(date).format(format);
    }
    getDateFormatFront(date) {
        return moment(date).format(this.FORMAT_DATE_FRONT);
    }
    getTimeFormat(time, format) {
        format = this.isDefined(format) ? format : this.FORMAT_TIME_BD;
        return moment(time).format(format);
    }
    isDefined(value) {
        return typeof value !== "undefined" && value !== null;
    }
}
exports.DateUtil = DateUtil;
//# sourceMappingURL=date-util.js.map