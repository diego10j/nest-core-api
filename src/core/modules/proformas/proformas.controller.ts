import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { AssignProformaDto } from './dto/assign-proforma.dto';
import { CreateProformaWebDto } from './dto/create-proforma-web.dto';
import { GetPrecioClienteDto } from './dto/get-precio-cliente.dto';
import { GetProformaDto } from './dto/get-proforma.dto';
import { ProformasDto } from './dto/proformas.dto';
import { ResumenDiarioProformasDto } from './dto/resumen-diario-proformas.dto';
import { SaveProformaDto } from './dto/save-proforma.dto';
import { SendProformaEmailDto } from './dto/send-proforma-email.dto';
import { ProformasService } from './proformas.service';

@ApiTags('Proformas')
@Controller('proformas')
export class ProformasController {
  constructor(private readonly service: ProformasService) { }

  @Post('calcularPreciosCliente')
  @ApiOperation({ summary: 'Calcular precios de productos para un cliente específico' })
  // @Auth()
  calcularPreciosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: GetPrecioClienteDto) {
    return this.service.calcularPreciosCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProformas')
  @ApiOperation({ summary: 'Listar proformas por período y filtros' })
  // @Auth()
  getProformas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ProformasDto) {
    return this.service.getProformas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProformaByID')
  @ApiOperation({ summary: 'Obtener proforma con todos sus detalles por ID' })
  // @Auth()
  getProformaByID(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProformaDto) {
    return this.service.getProformaByID({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveProforma')
  @ApiOperation({ summary: 'Crear o actualizar una proforma' })
  // @Auth()
  saveProforma(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveProformaDto) {
    return this.service.saveProforma({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataTipoProforma')
  @ApiOperation({ summary: 'Obtener tipos de proforma para selector' })
  // @Auth()
  getListDataTipoProforma(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataTipoProforma({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataTiempoEntrega')
  @ApiOperation({ summary: 'Obtener opciones de tiempo de entrega para selector' })
  // @Auth()
  getListDataTiempoEntrega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataTiempoEntrega({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataValidezProforma')
  @ApiOperation({ summary: 'Obtener opciones de validez de proforma para selector' })
  // @Auth()
  getListDataValidezProforma(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataValidezProforma({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getListDataFormaPago')
  @ApiOperation({ summary: 'Obtener formas de pago disponibles para selector' })
  // @Auth()
  getListDataFormaPago(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataFormaPago({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Post('createProformaWeb')
  @ApiOperation({ summary: 'Crear solicitud de proforma desde la web pública (sin autenticación)' })
  saveCampania(@Body() dtoIn: CreateProformaWebDto) {
    return this.service.createProformaWeb({
      ...dtoIn,
    });
  }

  @Post('assignProformaToUser')
  @ApiOperation({ summary: 'Asignar proforma web a un usuario del sistema (sin autenticación)' })
  assignProformaToUser(@AppHeaders() _h: HeaderParamsDto, @Body() dtoIn: AssignProformaDto) {
    return this.service.assignProformaToUser(dtoIn);
  }

  @Post('openProformaWeb')
  @ApiOperation({ summary: 'Registrar apertura de proforma web por un usuario autenticado' })
  openProformaWeb(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdeDto) {
    return this.service.openProformaWeb(dtoIn.ide, headersParams);
  }

  @Post('updateOpenSolicitud')
  @ApiOperation({ summary: 'Registrar apertura de solicitud de proforma web' })
  // @Auth()
  updateOpenSolicitud(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: IdeDto) {
    return this.service.updateOpenSolicitud(dtoIn.ide, headersParams.login);
  }

  @Get('getResumenDiarioProformas')
  @ApiOperation({ summary: 'Obtener resumen diario de proformas generadas' })
  // @Auth()
  getResumenDiarioProformas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ResumenDiarioProformasDto) {
    return this.service.getResumenDiarioProformas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('sendProformaEmail')
  @ApiOperation({ summary: 'Enviar proforma por correo electronico con PDF adjunto' })
  // @Auth()
  sendProformaEmail(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SendProformaEmailDto) {
    return this.service.sendProformaEmail({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getPreviewProformaEmail')
  @ApiOperation({ summary: 'Obtener preview HTML del correo de proforma' })
  // @Auth()
  getPreviewProformaEmail(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProformaDto) {
    return this.service.getPreviewProformaEmail({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFilesProforma')
  @ApiOperation({ summary: 'Obtener archivos adjuntos de los productos del detalle de la proforma' })
  // @Auth()
  getFilesProforma(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProformaDto) {
    return this.service.getFilesProforma({
      ...headersParams,
      ...dtoIn,
    });
  }
}
