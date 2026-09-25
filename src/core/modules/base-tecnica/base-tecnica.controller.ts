import { Body, Controller, Get, HttpStatus, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { BdtChatService } from './bdt-chat.service';
import { BdtDatosService } from './bdt-datos.service';
import { BdtProcesoService } from './bdt-proceso.service';
import { BuscarProductosBdtDto } from './dto/buscar-productos-bdt.dto';
import { CalificarConsultaDto } from './dto/calificar-consulta.dto';
import { ChatBaseTecnicaDto } from './dto/chat-base-tecnica.dto';
import { IdeDocumentoDto } from './dto/ide-documento.dto';
import { IdeInartiDto } from './dto/ide-inarti.dto';
import { IdeProcesoDto } from './dto/ide-proceso.dto';
import { ProcesarProductoDto } from './dto/procesar-producto.dto';
import { RevisarDocumentoDto } from './dto/revisar-documento.dto';
import { SetVigenteOrigenDto } from './dto/set-vigente-origen.dto';
import { UuidArchivoDto } from './dto/uuid-archivo.dto';

@ApiTags('BaseTecnica')
@Controller('base-tecnica')
export class BaseTecnicaController {
  constructor(
    private readonly proceso: BdtProcesoService,
    private readonly datos: BdtDatosService,
    private readonly chat: BdtChatService,
  ) {}

  // ------------------------------------------------------------------ procesamiento

  @Post('procesarProducto')
  @ApiOperation({
    summary:
      'Procesa en segundo plano los adjuntos del producto (incluye subcarpetas) y actualiza la base técnica. ' +
      'Devuelve ide_bdrun para consultar el avance con getProceso.',
  })
  procesarProducto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ProcesarProductoDto) {
    return this.proceso.iniciarProceso({ ...headersParams, ...dtoIn });
  }

  @Post('extraerArchivo')
  @ApiOperation({
    summary:
      'Extrae o vuelve a extraer UN adjunto (botón del diálogo "Ver texto"). Síncrono: responde con el ' +
      'documento resultante (ide_bddoc, estado, tipo).',
  })
  extraerArchivo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UuidArchivoDto) {
    return this.proceso.procesarArchivoIndividual({ ...headersParams, ...dtoIn });
  }

  @Post('eliminarExtraccion')
  @ApiOperation({ summary: 'Elimina la extracción de un documento de la base técnica (el adjunto no se toca)' })
  eliminarExtraccion(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdeDocumentoDto) {
    return this.proceso.eliminarExtraccion({ ...headersParams, ...dtoIn });
  }

  @Get('getProceso')
  @ApiOperation({ summary: 'Avance/resultado de una corrida de procesamiento' })
  getProceso(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeProcesoDto) {
    return this.datos.getProceso({ ...headersParams, ...dtoIn });
  }

  // ------------------------------------------------------------------ consulta (tab Datos técnicos)

  @Get('getResumenProducto')
  @ApiOperation({ summary: 'Estado de la base técnica del producto y si hay adjuntos sin procesar' })
  getResumenProducto(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeInartiDto) {
    return this.datos.getResumenProducto({ ...headersParams, ...dtoIn });
  }

  @Get('getDocumentos')
  @ApiOperation({ summary: 'Documentos técnicos del producto' })
  getDocumentos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeInartiDto) {
    return this.datos.getDocumentos({ ...headersParams, ...dtoIn });
  }

  @Get('getDocumento')
  @ApiOperation({ summary: 'Documento completo: texto original, traducción, valores y secciones' })
  getDocumento(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeDocumentoDto) {
    return this.datos.getDocumento({ ...headersParams, ...dtoIn });
  }

  @Get('getDocumentoPorArchivo')
  @ApiOperation({ summary: 'Documento técnico generado desde un adjunto (Ver texto del explorador de archivos)' })
  getDocumentoPorArchivo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidArchivoDto) {
    return this.datos.getDocumentoPorArchivo({ ...headersParams, ...dtoIn });
  }

  @Get('getValores')
  @ApiOperation({ summary: 'Valores técnicos vigentes del producto' })
  getValores(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeInartiDto) {
    return this.datos.getValores({ ...headersParams, ...dtoIn });
  }

  @Get('getLotes')
  @ApiOperation({ summary: 'Lotes registrados desde certificados de análisis' })
  getLotes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeInartiDto) {
    return this.datos.getLotes({ ...headersParams, ...dtoIn });
  }

  @Get('getOrigenes')
  @ApiOperation({ summary: 'Orígenes técnicos (fabricante/grado) del producto' })
  getOrigenes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeInartiDto) {
    return this.datos.getOrigenes({ ...headersParams, ...dtoIn });
  }

  @Get('getHistorial')
  @ApiOperation({ summary: 'Bitácora de cambios de la base técnica del producto' })
  getHistorial(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeInartiDto) {
    return this.datos.getHistorial({ ...headersParams, ...dtoIn });
  }

  @Post('revisarDocumento')
  @ApiOperation({ summary: 'Aprobar/rechazar un documento, con corrección opcional de tipo y valores' })
  revisarDocumento(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: RevisarDocumentoDto) {
    return this.datos.revisarDocumento({ ...headersParams, ...dtoIn });
  }

  @Post('setVigenteOrigen')
  @ApiOperation({ summary: 'Marcar el origen (fabricante/grado) que se comercializa actualmente' })
  setVigenteOrigen(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SetVigenteOrigenDto) {
    return this.datos.setVigenteOrigen({ ...headersParams, ...dtoIn });
  }

  // ------------------------------------------------------------------ chat QuimIA

  @Post('buscarProductos')
  @ApiOperation({ summary: 'Productos con base técnica (selector "Cambiar producto" del chat)' })
  buscarProductos(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: BuscarProductosBdtDto) {
    return this.chat.buscarProductos({ ...headersParams, ...dtoIn });
  }

  @Post('chat')
  @ApiOperation({
    summary:
      'Chat QuimIA sobre la base técnica. Responde NDJSON por eventos: producto, seleccion, sugerir_cambio, ' +
      'delta, citas, sin_respuesta, sin_producto, aviso_ia, error, fin.',
  })
  async chatBaseTecnica(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: ChatBaseTecnicaDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(HttpStatus.OK);

    await this.chat.responder({ ...headersParams, ...dtoIn }, (evento) => {
      if (!res.writableEnded) res.write(`${JSON.stringify(evento)}\n`);
    });
    res.end();
  }

  @Post('calificarConsulta')
  @ApiOperation({ summary: 'Feedback 👍/👎 de una respuesta del chat' })
  calificarConsulta(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: CalificarConsultaDto) {
    return this.chat.calificarConsulta({ ...headersParams, ...dtoIn });
  }
}
