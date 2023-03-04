"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UtilitarioService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const sql_util_1 = require("./sql-util");
let UtilitarioService = class UtilitarioService {
    constructor() {
        this.SQL_UTIL = new sql_util_1.SqlUtil();
        this.validarDTO = async (dto, obj) => {
            const objInstance = (0, class_transformer_1.plainToClass)(dto, obj);
            const errors = await (0, class_validator_1.validate)(objInstance);
            if (errors.length > 0) {
                throw new common_1.BadRequestException(`${errors}`);
            }
        };
    }
};
UtilitarioService = __decorate([
    (0, common_1.Injectable)()
], UtilitarioService);
exports.UtilitarioService = UtilitarioService;
//# sourceMappingURL=utilitario.service.js.map