import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { BdtContenidoService } from './bdt-contenido.service';
import { BdtDatosService } from './bdt-datos.service';
import { BdtProcesoService } from './bdt-proceso.service';
import { IdeDocumentoDto } from './dto/ide-documento.dto';
import { IdeInartiDto } from './dto/ide-inarti.dto';
import { IdeProcesoDto } from './dto/ide-proceso.dto';
import { IdesDocumentosDto } from './dto/ides-documentos.dto';
import { ProcesarProductoDto } from './dto/procesar-producto.dto';
import { RevisarDocumentoDto } from './dto/revisar-documento.dto';
import { SetVigenteOrigenDto } from './dto/set-vigente-origen.dto';
import { UuidArchivoDto } from './dto/uuid-archivo.dto';
import { UuidsArchivosDto } from './dto/uuids-archivos.dto';

@ApiTags('BaseTecnica')
@Controller('base-tecnica')
export class BaseTecnicaController {
  constructor(
    private readonly proceso: BdtProcesoService,
    private readonly datos: BdtDatosService,
    private readonly contenido: BdtContenidoService,
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
      'Extrae o vuelve a extraer UN adjunto (tab Datos técnicos: "Extraer" / "Volver a extraer"). Síncrono: responde con el ' +
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

  @Post('eliminarExtracciones')
  @ApiOperation({ summary: 'Elimina varias extracciones (al borrar sus adjuntos desde el explorador de archivos)' })
  async eliminarExtracciones(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdesDocumentosDto) {
    let eliminados = 0;
    for (const ide_bddoc of dtoIn.ides_bddoc) {
      // Uno ya eliminado (doble clic, otra pestaña) no debe cortar la limpieza del resto.
      const ok = await this.proceso
        .eliminarExtraccion({ ...headersParams, ide_bddoc })
        .then(() => true)
        .catch(() => false);
      if (ok) eliminados++;
    }
    return { message: 'ok', eliminados };
  }

  @Post('getDocumentosPorArchivos')
  @ApiOperation({
    summary: 'Documentos de la base técnica de los adjuntos/carpetas indicados (confirmación antes de eliminar archivos)',
  })
  getDocumentosPorArchivos(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UuidsArchivosDto) {
    return this.datos.getDocumentosPorArchivos({ ...headersParams, ...dtoIn });
  }

  @Get('getProceso')
  @ApiOperation({ summary: 'Avance/resultado de una corrida de procesamiento' })
  getProceso(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeProcesoDto) {
    return this.datos.getProceso({ ...headersParams, ...dtoIn });
  }

  @Post('generarContenidoProducto')
  @ApiOperation({
    summary:
      'Genera descripción corta, descripción larga (HTML) y otros nombres del producto a partir de su base técnica. ' +
      'Si no hay documentos técnicos devuelve con_base_tecnica = false (el frontend ofrece generar solo con GPT).',
  })
  generarContenidoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdeInartiDto) {
    return this.contenido.generarContenidoProducto({ ...headersParams, ...dtoIn });
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
}
