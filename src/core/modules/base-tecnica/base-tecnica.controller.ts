import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { BdtArchivosService } from './bdt-archivos.service';
import { BdtAutomaticoService } from './bdt-automatico.service';
import { BdtContenidoService } from './bdt-contenido.service';
import { BdtDatosService } from './bdt-datos.service';
import { BdtImportadorService } from './bdt-importador.service';
import { BdtMarcaAguaService } from './bdt-marca-agua.service';
import { BdtMasivoService } from './bdt-masivo.service';
import { BdtProcesoService } from './bdt-proceso.service';
import { ConfiguracionBdtDto } from './dto/configuracion-bdt.dto';
import { GenerarContenidoDto } from './dto/generar-contenido.dto';
import { GetArchivosCargadosDto } from './dto/get-archivos-cargados.dto';
import { GetCoberturaProductosDto } from './dto/get-cobertura-productos.dto';
import { GetDocumentosTecnicosDto } from './dto/get-documentos-tecnicos.dto';
import { IdeDocumentoDto } from './dto/ide-documento.dto';
import { IdeInartiDto } from './dto/ide-inarti.dto';
import { IdeProcesoDto } from './dto/ide-proceso.dto';
import { IdesDocumentosDto } from './dto/ides-documentos.dto';
import { PausarMasivoDto } from './dto/pausar-masivo.dto';
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
    private readonly masivo: BdtMasivoService,
    private readonly automatico: BdtAutomaticoService,
    private readonly marcaAgua: BdtMarcaAguaService,
    private readonly importador: BdtImportadorService,
    private readonly archivos: BdtArchivosService,
  ) {}

  // ------------------------------------------------------------------ página Base Técnica (mantenimiento)

  @Get('getDocumentosTecnicos')
  @ApiOperation({ summary: 'Listado general de documentos extraídos (DataTableQuery) con filtros' })
  getDocumentosTecnicos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDocumentosTecnicosDto) {
    return this.datos.getDocumentosTecnicos({ ...headersParams, ...dtoIn });
  }

  // ------------------------------------------------------------------ página Archivos cargados (control de adjuntos)

  @Get('getArchivosCargados')
  @ApiOperation({
    summary:
      'Adjuntos de todos los productos (DataTableQuery) con su tipo (ficha/COA/hoja), duplicados por tipo y si se extrajeron',
  })
  getArchivosCargados(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetArchivosCargadosDto) {
    return this.archivos.getArchivosCargados({ ...headersParams, ...dtoIn });
  }

  @Get('getCoberturaProductos')
  @ApiOperation({ summary: 'Por producto: cuántas fichas, COA y hojas de seguridad tiene (y cuáles le faltan)' })
  getCoberturaProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCoberturaProductosDto) {
    return this.archivos.getCoberturaProductos({ ...headersParams, ...dtoIn });
  }

  @Get('getDashboardArchivos')
  @ApiOperation({
    summary:
      'Dashboard de archivos de productos: por tipo y formato (cantidad y peso), más pesados, productos con más archivos, más descargados y cargas por mes',
  })
  getDashboardArchivos(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.archivos.getDashboardArchivos(headersParams);
  }

  @Get('getResumenArchivos')
  @ApiOperation({ summary: 'Totales de las tarjetas de la página Archivos cargados' })
  getResumenArchivos(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.archivos.getResumenArchivos(headersParams);
  }

  @Get('getDocumentosConProveedor')
  @ApiOperation({
    summary:
      'Documentos extraídos que mencionan a un proveedor local (gen_persona con RUC, ej. el importador). ' +
      'Omite los que mencionan a la propia empresa (importaciones propias).',
  })
  getDocumentosConProveedor(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.importador.getDocumentosConProveedor(headersParams);
  }

  @Get('getResumenGeneral')
  @ApiOperation({ summary: 'Totales para las tarjetas: por estado, pendientes, reutilizados y costos' })
  getResumenGeneral(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.masivo.getResumen(headersParams.ideEmpr);
  }

  @Get('getProcesoMasivo')
  @ApiOperation({ summary: 'Avance de la última extracción masiva / mejorada (barra de avance)' })
  getProcesoMasivo(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.masivo.getEstado(headersParams.ideEmpr);
  }

  @Get('getMarcaAguaMasivo')
  @ApiOperation({ summary: 'Avance de la marca de agua a documentos aprobados (y cuántos faltan)' })
  getMarcaAguaMasivo(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.marcaAgua.getEstado(headersParams.ideEmpr);
  }

  @Post('iniciarMarcaAgua')
  @ApiOperation({ summary: 'Pone la marca de agua a los documentos aprobados que aún no la tienen (segundo plano)' })
  iniciarMarcaAgua(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.marcaAgua.iniciar(headersParams);
  }

  @Post('cancelarMarcaAgua')
  @ApiOperation({ summary: 'Detiene la marca de agua masiva' })
  cancelarMarcaAgua(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.marcaAgua.cancelar(headersParams.ideEmpr);
  }

  @Post('iniciarMasivo')
  @ApiOperation({ summary: 'Extrae en segundo plano todos los adjuntos pendientes de los productos activos' })
  iniciarMasivo(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.masivo.iniciar(headersParams);
  }

  @Post('pausarMasivo')
  @ApiOperation({ summary: 'Pausa o reanuda la extracción masiva en curso' })
  pausarMasivo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: PausarMasivoDto) {
    return this.masivo.pausar(headersParams.ideEmpr, dtoIn.pausar);
  }

  @Post('cancelarMasivo')
  @ApiOperation({ summary: 'Cancela la extracción masiva en curso (al terminar el documento actual)' })
  cancelarMasivo(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.masivo.cancelar(headersParams.ideEmpr);
  }

  @Post('extraerMejorado')
  @ApiOperation({ summary: '"Extracción mejorada" en lote de documentos seleccionados (segundo plano)' })
  extraerMejorado(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdesDocumentosDto) {
    return this.masivo.iniciarMejorado({ ...headersParams, ...dtoIn });
  }

  @Get('getConfiguracion')
  @ApiOperation({ summary: 'Configuración: extracción automática al subir archivos y tope diario' })
  getConfiguracion(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.automatico.getConfiguracion(headersParams.ideEmpr);
  }

  @Post('saveConfiguracion')
  @ApiOperation({ summary: 'Guarda la configuración de la base técnica' })
  saveConfiguracion(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ConfiguracionBdtDto) {
    return this.automatico.saveConfiguracion({ ...dtoIn, ideEmpr: headersParams.ideEmpr, login: headersParams.login });
  }

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
  generarContenidoProducto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GenerarContenidoDto) {
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

  @Post('aprobarDocumentos')
  @ApiOperation({
    summary: 'Aprueba en lote los documentos seleccionados que están en revisión (misma lógica que revisarDocumento)',
  })
  async aprobarDocumentos(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdesDocumentosDto) {
    let aprobados = 0;
    const errores: string[] = [];
    for (const ide_bddoc of dtoIn.ides_bddoc) {
      // Uno que falle (ya aprobado en otra pestaña, eliminado) no corta el resto del lote.
      await this.datos
        .revisarDocumento({ ...headersParams, ide_bddoc, estado: 'APROBADO' })
        .then(() => aprobados++)
        .catch((e) => errores.push(`${ide_bddoc}: ${e?.message ?? e}`));
    }
    return { message: 'ok', aprobados, errores };
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
