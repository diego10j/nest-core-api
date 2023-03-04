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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConexionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const columnas_tabla_dto_1 = require("./dto/columnas-tabla.dto");
const utilitario_service_1 = require("../utilitario/utilitario.service");
let ConexionService = class ConexionService {
    constructor(dataSource, utilitario) {
        this.dataSource = dataSource;
        this.utilitario = utilitario;
        this.logger = new common_1.Logger('ConexionService');
    }
    async getColumnasTabla(dto) {
        await this.utilitario.validatDTO(columnas_tabla_dto_1.ColumnasTablaDto, dto);
        let sql = ` SELECT 
                    lower(column_name)  as nombre, 
                    upper(column_name)  as nombreVisual, 
                    ordinal_position  as orden,
                    CASE WHEN is_nullable = 'YES' THEN false
                    ELSE true end as requerida,
                    data_type  as tipo,
                    character_maximum_lengtH as  longitud,
                    CASE WHEN numeric_scale isnull THEN 0
                    ELSE numeric_scale end as decimales,
                    'Texto' as componente,
                    true as visible,
                    false as lectura,
                    null as valorDefecto,
                    null as mascara,
                    false as filtro,
                    null as comentario,
                    false as mayuscula,
                    false as unico,
                    true as ordenable,
                    COALESCE(character_maximum_lengtH ,8)as anchoColumna,
                    CASE WHEN numeric_precision isnull THEN false 
                    ELSE true end as isNumber,
                    numeric_scale as decimales,
                    CASE WHEN datetime_precision isnull THEN false 
                    ELSE true end as isDate,
                    CASE WHEN data_type = 'boolean' THEN true 
                    ELSE false end as isBoolean
                    FROM information_schema.columns a       
                    WHERE table_name  = $1 `;
        let values = [dto.nombreTabla];
        if (dto.columnas) {
            sql += ` AND column_name = ANY ($2)`;
            values.push(dto.columnas);
        }
        const data = await this.dataSource.query(sql, values);
        if (data.length === 0) {
            throw new common_1.BadRequestException(`No se encontraron resultados para la tabla: ${dto.nombreTabla}, columnas: ${dto.columnas}`);
        }
        if (dto.columnas) {
            if (data.length != dto.columnas.length) {
                throw new common_1.BadRequestException(`No se encontraron todas las columnas: ${dto.columnas}`);
            }
        }
        return data;
    }
    async consultaSQL(dto) {
    }
};
ConexionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource,
        utilitario_service_1.UtilitarioService])
], ConexionService);
exports.ConexionService = ConexionService;
//# sourceMappingURL=conexion.service.js.map