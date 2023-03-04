"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoreModule = void 0;
const common_1 = require("@nestjs/common");
const datasource_service_1 = require("./connection/datasource.service");
const util_service_1 = require("./util/util.service");
const audit_service_1 = require("./audit/audit.service");
let CoreModule = class CoreModule {
};
CoreModule = __decorate([
    (0, common_1.Module)({
        providers: [datasource_service_1.DataSourceService, util_service_1.UtilService, audit_service_1.AuditService],
        exports: [datasource_service_1.DataSourceService],
    })
], CoreModule);
exports.CoreModule = CoreModule;
//# sourceMappingURL=core.module.js.map