"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UtilService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const helpers_1 = require("./helpers");
let UtilService = class UtilService {
    constructor() {
        this.SQL_UTIL = new helpers_1.SqlUtil();
        this.STRING_UTIL = new helpers_1.StringUtil();
        this.DATE_UTIL = new helpers_1.DateUtil();
        this.validateDTO = async (dto, obj) => {
            const objInstance = (0, class_transformer_1.plainToClass)(dto, obj);
            const errors = await (0, class_validator_1.validate)(objInstance);
            if (errors.length > 0) {
                throw new common_1.BadRequestException(`${errors}`);
            }
        };
    }
    isDefined(value) {
        return typeof value !== "undefined" && value !== null;
    }
    getGenericScreen() {
        return ["simple", "simple-ui", "doble", "recursiva", "triple"];
    }
};
UtilService = __decorate([
    (0, common_1.Injectable)()
], UtilService);
exports.UtilService = UtilService;
//# sourceMappingURL=util.service.js.map