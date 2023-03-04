"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
const datasource_service_1 = require("../connection/datasource.service");
const helpers_1 = require("../connection/helpers");
let AuditService = class AuditService {
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async saveAccessAudit(ide_usua, ide_acau, ip, detalle_auac, dispositivo, fin_auac = true) {
        const insertQuery = new helpers_1.InsertQuery('sis_auditoria_acceso');
        insertQuery.values.set('ide_usua', ide_usua);
        insertQuery.values.set('ide_acau', ide_acau);
        insertQuery.values.set('fecha_auac', this.dataSource.util.DATE_UTIL.getCurrentDate());
        insertQuery.values.set('hora_auac', this.dataSource.util.DATE_UTIL.getCurrentTime());
        insertQuery.values.set('ip_auac', ip);
        insertQuery.values.set('fin_auac', fin_auac);
        insertQuery.values.set('id_session_auac', dispositivo);
        insertQuery.values.set('detalle_auac', detalle_auac);
        insertQuery.values.set('ide_auac', await this.dataSource.getSeqTable('sis_auditoria_acceso', 'ide_auac'));
        this.dataSource.createQuery(insertQuery);
    }
};
AuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [datasource_service_1.DataSourceService])
], AuditService);
exports.AuditService = AuditService;
//# sourceMappingURL=audit.service.js.map