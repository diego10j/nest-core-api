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

import { ConciliacionBancariaSaveService } from './conciliacion-bancaria-save.service';
import { ConciliacionBancariaService } from './conciliacion-bancaria.service';
import {
    ActualizarToleranciaDto, CargarArchivoDto, CerrarConciliacionDto, ConciliarManualDto, DesconciliarDto,
    GetConciliacionesDto, GetMovimientosBancoDto, GetMovimientosErpDto, GetResumenMensualDto, IdConciliacionDto,
    MarcarMovimientosDto, SugerirDto,
} from './dto/conciliacion-bancaria.dto';

const DIR_CONCILIACIONES = path.join(envs.pathDrive, 'tesoreria', 'conciliaciones');
/** Un estado de cuenta mensual pesa unos cientos de KB; 15 MB deja margen de sobra. */
const MAX_BYTES_ARCHIVO = 15 * 1024 * 1024;

const cuerpoArchivo = {
    schema: {
        type: 'object',
        properties: {
            file: { type: 'string', format: 'binary', description: 'Estado de cuenta del banco (.xlsx, .csv o .pdf)' },
            ideTecba: { type: 'number', description: 'Cuenta bancaria del ERP (opcional al analizar)' },
            anio: { type: 'number' },
            mes: { type: 'number' },
            toleranciaDias: { type: 'number' },
        },
        required: ['file', 'anio', 'mes'],
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

    @Post('analizarArchivo')
    @ApiOperation({ summary: 'Vista previa de un estado de cuenta: banco, cuenta del ERP detectada, periodo, saldos y movimientos nuevos (no guarda nada)' })
    @ApiConsumes('multipart/form-data')
    @ApiBody(cuerpoArchivo)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_ARCHIVO } }))
    analizarArchivo(
        @AppHeaders() h: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: CargarArchivoDto,
    ) {
        if (!file) throw new BadRequestException('No se recibió el archivo.');
        return this.saveService.analizarArchivo(file.buffer, file.originalname, { ...h, ...dto });
    }

    @Post('cargarArchivo')
    @ApiOperation({ summary: 'Carga el estado de cuenta a la conciliación de la cuenta y el mes (la crea si no existe; si existe agrega solo los movimientos nuevos) y corre el cruce automático' })
    @ApiConsumes('multipart/form-data')
    @ApiBody(cuerpoArchivo)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_ARCHIVO } }))
    cargarArchivo(
        @AppHeaders() h: HeaderParamsDto,
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: CargarArchivoDto,
    ) {
        if (!file) throw new BadRequestException('No se recibió el archivo.');
        return this.saveService.cargarArchivo(file, { ...h, ...dto });
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

    @Post('anular')
    @ApiOperation({ summary: 'Anula la conciliación y libera todos sus cruces' })
    anular(@AppHeaders() h: HeaderParamsDto, @Body() dto: IdConciliacionDto) {
        return this.saveService.anular({ ...h, ...dto });
    }
}
