import fs from 'node:fs';
import path from 'node:path';

import {
    BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, Res,
    UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';

import { AjustesErpConciliacionService } from './ajustes-erp-conciliacion.service';
import { CargaEstadosCuentaService } from './carga-estados-cuenta.service';
import { ComparacionConciliacionService } from './comparacion-conciliacion.service';
import { ConciliacionBancariaSaveService } from './conciliacion-bancaria-save.service';
import { ConciliacionBancariaService } from './conciliacion-bancaria.service';
import { DiferenciasConciliacionService } from './diferencias-conciliacion.service';
import {
    ActualizarFechaErpDto, ActualizarToleranciaDto, AnularConciliacionDto, CargarArchivoDto, CrearConciliacionDto, EditarConciliacionDto, CerrarConciliacionDto, ConciliarManualDto, DesconciliarDto,
    GetArchivosCargadosDto, GetComparacionDto, GetConciliacionesDto, GetMovimientosBancoDto, GetMovimientosErpDto, GetResumenMensualDto, IdConciliacionDto,
    MarcarMovimientosDto, RegistrarMovimientoBancoDto, RegistrarMovimientosBancoDto, SugerirDto,
} from './dto/conciliacion-bancaria.dto';

const DIR_CONCILIACIONES = path.join(envs.pathDrive, 'tesoreria', 'conciliaciones');
/** Un estado de cuenta mensual pesa unos cientos de KB; 15 MB deja margen de sobra. */
const MAX_BYTES_ARCHIVO = 15 * 1024 * 1024;

const cuerpoArchivo = {
    schema: {
        type: 'object',
        properties: {
            file: { type: 'string', format: 'binary', description: 'Estado de cuenta del banco (.xlsx, .csv o .pdf)' },
            ideTecnc: { type: 'number', description: 'Conciliación (cuenta + mes) a la que se carga' },
            procesar: { type: 'boolean', description: 'Correr el cruce automático después de cargar' },
            validarConIa: { type: 'boolean', description: 'Verificar con IA que el archivo corresponde (solo al analizar)' },
        },
        required: ['file', 'ideTecnc'],
    },
};

/**
 * Conciliación bancaria mensual de cualquier cuenta: se sube el estado de cuenta del banco (Excel,
 * CSV o PDF), se leen sus movimientos y se cruzan contra el libro de bancos (tes_cab_libr_banc).
 */
@ApiTags('Tesoreria - Conciliacion Bancaria')
@Controller('tesoreria/conciliacion-bancaria')
export class ConciliacionBancariaController {
    constructor(
        private readonly service: ConciliacionBancariaService,
        private readonly saveService: ConciliacionBancariaSaveService,
        private readonly comparacionService: ComparacionConciliacionService,
        private readonly cargaService: CargaEstadosCuentaService,
        private readonly diferenciasService: DiferenciasConciliacionService,
        private readonly ajustesErpService: AjustesErpConciliacionService,
    ) { }

    // ─── CONSULTAS ───────────────────────────────────────────────────────────

    @Get('getResumenMensual')
    @ApiOperation({ summary: 'Tablero del mes: todas las cuentas de la sucursal con el estado de su conciliación' })
    getResumenMensual(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetResumenMensualDto) {
        return this.service.getResumenMensual({ ...h, ...dto });
    }

    @Get('getConciliaciones')
    @ApiOperation({ summary: 'Listado de conciliaciones (filtrable por año, mes y cuenta)' })
    getConciliaciones(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetConciliacionesDto) {
        return this.service.getConciliaciones({ ...h, ...dto });
    }

    @Get('getArchivosCargados')
    @ApiOperation({ summary: 'Historial de estados de cuenta cargados (pantalla de carga)' })
    getArchivosCargados(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetArchivosCargadosDto) {
        return this.service.getArchivosCargados({ ...h, ...dto });
    }

    @Get('getConciliacion')
    @ApiOperation({ summary: 'Cabecera, archivos y resumen de saldos/diferencias de una conciliación' })
    getConciliacion(@AppHeaders() h: HeaderParamsDto, @Query() dto: IdConciliacionDto) {
        return this.service.getConciliacion(dto.ideTecnc, h);
    }

    @Get('getMovimientosBanco')
    @ApiOperation({ summary: 'Movimientos del estado de cuenta cargados, con su cruce si lo tienen' })
    getMovimientosBanco(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetMovimientosBancoDto) {
        return this.service.getMovimientosBanco({ ...h, ...dto });
    }

    @Get('getMovimientosErp')
    @ApiOperation({ summary: 'Movimientos del libro de bancos candidatos a cruzarse (mes + tolerancia de días)' })
    getMovimientosErp(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetMovimientosErpDto) {
        return this.service.getMovimientosErp({ ...h, ...dto });
    }

    @Get('getCruces')
    @ApiOperation({ summary: 'Cruces vigentes (banco <-> ERP) agrupados' })
    getCruces(@AppHeaders() h: HeaderParamsDto, @Query() dto: IdConciliacionDto) {
        return this.service.getCruces(dto.ideTecnc, h);
    }

    @Get('getResumenDiferencias')
    @ApiOperation({ summary: 'Tablero del mes para auxiliares: por cuenta, cuántos movimientos faltan en el ERP y en el banco (sin saldos)' })
    getResumenDiferencias(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetResumenMensualDto) {
        return this.diferenciasService.getResumenDiferencias({ ...h, ...dto });
    }

    @Get('getDiferencias')
    @ApiOperation({ summary: 'Movimientos con diferencia de una conciliación (faltan en el ERP, faltan en el banco, cruzados con diferencia de monto), sin saldos' })
    getDiferencias(@AppHeaders() h: HeaderParamsDto, @Query() dto: IdConciliacionDto) {
        return this.diferenciasService.getDiferencias(dto.ideTecnc, h);
    }

    @Get('getComparacion')
    @ApiOperation({ summary: 'Comparación banco ↔ ERP (solo lectura): bloques alineados con faltantes en rojo y advertencias en amarillo' })
    getComparacion(@AppHeaders() h: HeaderParamsDto, @Query() dto: GetComparacionDto) {
        return this.comparacionService.getComparacion(dto.ideTecnc, h, !!dto.sinSaldos);
    }

    @Get('descargarArchivo/:ideTecar')
    @ApiOperation({ summary: 'Descargar el archivo original del banco que se cargó a una conciliación' })
    async descargarArchivo(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideTecar', ParseIntPipe) ideTecar: number,
        @Res() res: Response,
    ) {
        const archivo = await this.service.getArchivo(ideTecar, h);
        const ruta = path.resolve(DIR_CONCILIACIONES, archivo.nombre_archivo_tecar);
        // El nombre sale de la BD, pero igual se exige que quede dentro de la carpeta de conciliaciones
        if (!ruta.startsWith(path.resolve(DIR_CONCILIACIONES) + path.sep) || !fs.existsSync(ruta)) {
            throw new NotFoundException('El archivo ya no está disponible en el servidor.');
        }
        res.download(ruta, archivo.nombre_original_tecar);
    }

    // ─── CARGA ───────────────────────────────────────────────────────────────

    @Post('crearConciliacion')
    @ApiOperation({ summary: 'Crea la conciliación (cuenta + mes) que después recibe los archivos del banco' })
    crearConciliacion(@AppHeaders() h: HeaderParamsDto, @Body() dto: CrearConciliacionDto) {
        return this.cargaService.crearConciliacion({ ...h, ...dto });
    }

    @Post('editarConciliacion')
    @ApiOperation({ summary: 'Corrige la cuenta, el mes o el año de una conciliación creada por error (solo si aún no tiene archivos cargados)' })
    editarConciliacion(@AppHeaders() h: HeaderParamsDto, @Body() dto: EditarConciliacionDto) {
        return this.cargaService.editarConciliacion({ ...h, ...dto });
    }

    @Post('analizarArchivo')
    @ApiOperation({ summary: 'Vista previa y validaciones de un estado de cuenta contra la conciliación creada: cuenta, mes, saldos, duplicados y verificación con IA (no guarda nada)' })
    @ApiConsumes('multipart/form-data')
    @ApiBody(cuerpoArchivo)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_ARCHIVO } }))
    analizarArchivo(
        @AppHeaders() h: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: CargarArchivoDto,
    ) {
        if (!file) throw new BadRequestException('No se recibió el archivo.');
        return this.cargaService.analizarArchivo(file.buffer, file.originalname, { ...h, ...dto });
    }

    @Post('cargarArchivo')
    @ApiOperation({ summary: 'Carga el estado de cuenta a la conciliación creada (agrega solo los movimientos nuevos); el cruce lo corre después quien concilia, salvo procesar=true' })
    @ApiConsumes('multipart/form-data')
    @ApiBody(cuerpoArchivo)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_ARCHIVO } }))
    cargarArchivo(
        @AppHeaders() h: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: CargarArchivoDto,
    ) {
        if (!file) throw new BadRequestException('No se recibió el archivo.');
        return this.cargaService.cargarArchivo(file, { ...h, ...dto });
    }

    // ─── CRUCES ──────────────────────────────────────────────────────────────

    @Post('conciliarAutomatico')
    @ApiOperation({ summary: 'Repite el cruce automático 1 a 1 (documento, monto y fecha) sobre lo pendiente' })
    conciliarAutomatico(@AppHeaders() h: HeaderParamsDto, @Body() dto: IdConciliacionDto) {
        return this.saveService.conciliarAutomatico(dto.ideTecnc, h);
    }

    @Post('sugerir')
    @ApiOperation({ summary: 'Sugerencias de cruce para lo pendiente: por suma y, opcionalmente, con IA. No aplica nada' })
    sugerir(@AppHeaders() h: HeaderParamsDto, @Body() dto: SugerirDto) {
        return this.saveService.sugerir({ ...h, ...dto });
    }

    @Post('conciliarManual')
    @ApiOperation({ summary: 'Concilia manualmente N movimientos del banco con M del ERP (también acepta sugerencias de la IA)' })
    conciliarManual(@AppHeaders() h: HeaderParamsDto, @Body() dto: ConciliarManualDto) {
        return this.saveService.conciliarManual({ ...h, ...dto });
    }

    @Post('desconciliar')
    @ApiOperation({ summary: 'Deshace el cruce al que pertenece un movimiento del banco' })
    desconciliar(@AppHeaders() h: HeaderParamsDto, @Body() dto: DesconciliarDto) {
        return this.saveService.desconciliar({ ...h, ...dto });
    }

    @Post('marcarMovimientos')
    @ApiOperation({ summary: 'Marca movimientos del banco sin cruce como FALTANTE en el ERP, IGNORADO o PENDIENTE' })
    marcarMovimientos(@AppHeaders() h: HeaderParamsDto, @Body() dto: MarcarMovimientosDto) {
        return this.saveService.marcarMovimientos({ ...h, ...dto });
    }

    @Post('actualizarTolerancia')
    @ApiOperation({ summary: 'Cambia la tolerancia de días del cruce automático de una conciliación' })
    actualizarTolerancia(@AppHeaders() h: HeaderParamsDto, @Body() dto: ActualizarToleranciaDto) {
        return this.saveService.actualizarTolerancia({ ...h, ...dto });
    }

    // ─── CIERRE ──────────────────────────────────────────────────────────────

    @Post('cerrar')
    @ApiOperation({ summary: 'Cierra la conciliación (queda de solo lectura)' })
    cerrar(@AppHeaders() h: HeaderParamsDto, @Body() dto: CerrarConciliacionDto) {
        return this.saveService.cerrar({ ...h, ...dto });
    }

    @Post('reabrir')
    @ApiOperation({ summary: 'Reabre una conciliación cerrada' })
    reabrir(@AppHeaders() h: HeaderParamsDto, @Body() dto: IdConciliacionDto) {
        return this.saveService.reabrir({ ...h, ...dto });
    }

    @Post('actualizarFechaErp')
    @ApiOperation({ summary: 'Iguala la fecha de un movimiento del ERP (cruce 1 a 1) a la fecha que tiene en el banco' })
    actualizarFechaErp(@AppHeaders() h: HeaderParamsDto, @Body() dto: ActualizarFechaErpDto) {
        return this.ajustesErpService.actualizarFechaErp({ ...h, ...dto });
    }

    @Post('registrarMovimientoBanco')
    @ApiOperation({ summary: 'Registra en el libro de bancos (con asiento contable) un movimiento del banco que faltaba en el ERP y lo concilia' })
    registrarMovimientoBanco(@AppHeaders() h: HeaderParamsDto, @Body() dto: RegistrarMovimientoBancoDto) {
        return this.ajustesErpService.registrarMovimientoBanco({ ...h, ...dto });
    }

    @Post('registrarMovimientosBanco')
    @ApiOperation({ summary: 'Registra varios movimientos del banco (mismo asiento contra la misma cuenta) y los concilia' })
    registrarMovimientosBanco(@AppHeaders() h: HeaderParamsDto, @Body() dto: RegistrarMovimientosBancoDto) {
        return this.ajustesErpService.registrarMovimientosBanco({ ...h, ...dto });
    }

    @Post('anular')
    @ApiOperation({ summary: 'Anula la conciliación (también cerrada), revierte sus cruces y permite rehacerla' })
    anular(@AppHeaders() h: HeaderParamsDto, @Body() dto: AnularConciliacionDto) {
        return this.saveService.anular({ ...h, ...dto });
    }
}
