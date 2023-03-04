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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const datasource_service_1 = require("../connection/datasource.service");
const helpers_1 = require("../connection/helpers");
const bcrypt = require("bcrypt");
const jwt_1 = require("@nestjs/jwt");
const audit_service_1 = require("../audit/audit.service");
const config_1 = require("@nestjs/config");
let AuthService = class AuthService {
    constructor(dataSource, audit, configService, jwtService) {
        this.dataSource = dataSource;
        this.audit = audit;
        this.configService = configService;
        this.jwtService = jwtService;
    }
    async login(loginUserDto) {
        const { password, userName } = loginUserDto;
        const queryUser = new helpers_1.SelectQuery("SELECT ide_usua FROM sis_usuario WHERE nick_usua = $1 AND activo_usua=true");
        queryUser.addStringParam(1, userName);
        const dataUser = await this.dataSource.createSingleQuery(queryUser);
        if (dataUser) {
            const queryPass = new helpers_1.SelectQuery(`
            SELECT bloqueado_usua,fecha_caduc_usua,fecha_vence_uscl,a.ide_usua,clave_uscl,
            nom_usua,mail_usua,a.ide_empr,nom_perf,a.ide_perf,avatar_usua,perm_util_perf,a.ide_empr,nick_usua 
            from sis_usuario a 
            inner join sis_usuario_clave b on a.ide_usua=b.ide_usua 
            inner join sis_perfil c on a.ide_perf=c.ide_perf 
            where a.ide_usua=$1 and activo_usua=true 
            and activo_uscl=true
            `);
            queryPass.addIntParam(1, dataUser.ide_usua);
            const dataPass = await this.dataSource.createSingleQuery(queryPass);
            if (dataPass) {
                if (dataPass.bloqueado_usua === true)
                    throw new common_1.UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');
                if (!bcrypt.compareSync(password, dataPass.clave_uscl)) {
                    this.audit.saveAccessAudit(dataUser.ide_usua, 1, loginUserDto.ip, "Contraseña incorrecta", loginUserDto.device);
                    throw new common_1.UnauthorizedException('Credenciales no válidas, Contraseña incorrecta');
                }
                else {
                    const menu = await this.getMenuByRol(dataPass.ide_perf);
                    const lastAccess = await this.getLastAccessUser(dataUser.ide_usua);
                    const updateQuery = new helpers_1.UpdateQuery("sis_auditoria_acceso");
                    updateQuery.values.set("fin_auac", true);
                    updateQuery.where = "ide_usua = $1 and ide_acau = $2 and  fin_auac = $3";
                    updateQuery.addNumberParam(1, dataUser.ide_usua);
                    updateQuery.addNumberParam(2, 0);
                    updateQuery.addBooleanParam(3, false);
                    await this.dataSource.createQuery(updateQuery);
                    this.audit.saveAccessAudit(dataUser.ide_usua, 0, loginUserDto.ip, "Iniciar sessión", loginUserDto.device);
                    return {
                        accessToken: this.getJwtToken({ id: dataUser.ide_usua }),
                        ide_usua: dataUser.ide_usua,
                        ide_empr: dataPass.ide_empr,
                        ide_perf: dataPass.ide_perf,
                        perm_util_perf: dataPass.perm_util_perf,
                        nom_perf: this.dataSource.util.STRING_UTIL.toTitleCase(dataPass.nom_perf),
                        id: '8864c717-587d-472a-929a-8e5f298024da-0',
                        displayName: this.dataSource.util.STRING_UTIL.toTitleCase(dataPass.nom_usua),
                        email: dataPass.mail_usua,
                        login: dataPass.nick_usua,
                        photoURL: `${this.configService.get('HOST_API')}/assets/images/avatars/avatar_default.jpg`,
                        phoneNumber: '0983113543',
                        country: 'Ecuador',
                        address: '90210 Broadway Blvd',
                        state: 'California',
                        city: 'San Francisco',
                        zipCode: '94116',
                        about: 'Praesent turpis. Phasellus viverra nulla ut metus varius laoreet. Phasellus tempus.',
                        role: 'admin',
                        isPublic: true,
                        menu,
                        lastAccess
                    };
                }
            }
        }
        else {
            throw new common_1.UnauthorizedException('Credenciales no válidas, Usuario incorrecto');
        }
    }
    async getMenuByRol(ide_perf) {
        const selectQueryMenu = new helpers_1.SelectQuery(`SELECT ide_opci,nom_opci,sis_ide_opci,paquete_opci,
        tipo_opci,icono_opci,
        (SELECT count(1) from sis_opcion WHERE sis_ide_opci = a.ide_opci ) as numHijos
        FROM sis_opcion a 
        WHERE a.ide_opci in (select ide_opci from sis_perfil_opcion where ide_perf=$1)
        ORDER BY sis_ide_opci DESC, nom_opci`);
        selectQueryMenu.addNumberParam(1, ide_perf);
        const data = await this.dataSource.createQuery(selectQueryMenu);
        let objStructure = new Array();
        for (let row of data) {
            objStructure.push(this.getMenuItem(row));
        }
        let resp = [];
        for (let row of objStructure) {
            const result = objStructure.filter((hijos) => hijos.node === row.data);
            if (result.length > 0) {
                let chi = new Array();
                for (let auxFila of result) {
                    chi.push(auxFila);
                }
                row["items"] = chi;
                if (row.node === null) {
                    resp.push(row);
                }
            }
        }
        return resp;
    }
    getMenuItem(row) {
        let objMenu = {};
        objMenu["label"] = row.nom_opci;
        objMenu["data"] = `${row.ide_opci}`;
        objMenu["package"] = row.paquete_opci;
        objMenu["node"] = row.sis_ide_opci;
        const index = this.dataSource.util.getGenericScreen().indexOf(row.tipo_opci);
        if (row.node !== null) {
            if (index === -1) {
                objMenu["path"] = row.tipo_opci;
            }
            else {
                objMenu["path"] = `${row.tipo_opci}/generic_${row.ide_opci}`;
            }
        }
        else {
            objMenu["label"] = row.nom_opci;
            objMenu["package"] = row.paquete_opci;
        }
        return objMenu;
    }
    async getLastAccessUser(ide_usua) {
        let lastDate = this.dataSource.util.DATE_UTIL.getDateFormatFront(new Date());
        const selectQuery = new helpers_1.SelectQuery(`select fecha_auac,hora_auac from sis_auditoria_acceso where ide_usua=$1 and ide_acau=0
        and ide_auac = (select max(ide_auac) from sis_auditoria_acceso where ide_usua=$2 and ide_acau=0 and fin_auac=true)`);
        selectQuery.addNumberParam(1, ide_usua);
        selectQuery.addNumberParam(2, ide_usua);
        const data = await this.dataSource.createSingleQuery(selectQuery);
        if (data) {
            lastDate = this.dataSource.util.DATE_UTIL.getDateFormatFront(data.fecha_auac) + " " + data.hora_auac;
        }
        return lastDate;
    }
    getJwtToken(payload) {
        const token = this.jwtService.sign(payload);
        return token;
    }
    async logout(serviceDto) {
        const updateQuery = new helpers_1.UpdateQuery("sis_auditoria_acceso");
        updateQuery.values.set("fin_auac", true);
        updateQuery.where = "ide_usua = $1 and ide_acau = $2 and  fin_auac = $3";
        updateQuery.addNumberParam(1, Number(serviceDto.ide_usua));
        updateQuery.addNumberParam(2, 8);
        updateQuery.addBooleanParam(3, false);
        this.dataSource.createQuery(updateQuery);
        this.audit.saveAccessAudit(Number(serviceDto.ide_usua), 8, serviceDto.ip, "Cerrar sessión", serviceDto.device);
        const queryPass = new helpers_1.SelectQuery(`
            SELECT * from sis_bloqueo where ide_bloq = -100`);
        const res = await this.dataSource.createQueryPG(queryPass);
        return res;
    }
};
AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [datasource_service_1.DataSourceService,
        audit_service_1.AuditService,
        config_1.ConfigService,
        jwt_1.JwtService])
], AuthService);
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map