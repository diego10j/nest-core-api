import { Body, Controller, Post } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { TrnClienteDto } from './dto/trn-cliente.dto';
import { IdClienteDto } from './dto/id-cliente.dto';
import { IVentasMensualesClienteDto } from './dto/ventas-mensuales.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';
import { SaveClienteDto } from './dto/save-cliente.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { ExistClienteDto } from './dto/exist-client.dto';

@Controller('ventas/clientes')
export class ClientesController {
  constructor(private readonly service: ClientesService) { }


  @Post('getCliente')
  // @Auth()
  getCliente(
    @Body() dtoIn: UuidDto
  ) {
    return this.service.getCliente(dtoIn);
  }

  @Post('getClientes')
  // @Auth()
  getClientes(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getClientes(dtoIn);
  }

  @Post('getSaldosClientes')
  // @Auth()
  getSaldosClientes(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getSaldosClientes(dtoIn);
  }



  @Post('getTrnCliente')
  // @Auth()
  getTrnCliente(
    @Body() dtoIn: TrnClienteDto
  ) {
    return this.service.getTrnCliente(dtoIn);
  }


  @Post('getDetalleVentasCliente')
  // @Auth()
  getDetalleVentasCliente(
    @Body() dtoIn: TrnClienteDto
  ) {
    return this.service.getDetalleVentasCliente(dtoIn);
  }


  @Post('getSaldo')
  // @Auth()
  getSaldo(
    @Body() dtoIn: IdClienteDto
  ) {
    return this.service.getSaldo(dtoIn);
  }

  @Post('getProductosCliente')
  // @Auth()
  getProductosCliente(
    @Body() dtoIn: IdClienteDto
  ) {
    return this.service.getProductosCliente(dtoIn);
  }


  @Post('getVentasMensuales')
  // @Auth()
  getVentasMensuales(
    @Body() dtoIn: IVentasMensualesClienteDto
  ) {
    return this.service.getVentasMensuales(dtoIn);
  }


  @Post('save')
  // @Auth()
  save(
    @Body() dtoIn: SaveClienteDto
  ) {
    return this.service.save(dtoIn);
  }



  @Post('getVentasConUtilidad')
  // @Auth()
  getVentasConUtilidad(
    @Body() dtoIn: TrnClienteDto
  ) {
    return this.service.getVentasConUtilidad(dtoIn);
  }

  @Post('getDireccionesCliente')
  // @Auth()
  getDireccionesCliente(
    @Body() dtoIn: IdClienteDto
  ) {
    return this.service.getDireccionesCliente(dtoIn);
  }


  @Post('getContactosCliente')
  // @Auth()
  getContactosCliente(
    @Body() dtoIn: IdClienteDto
  ) {
    return this.service.getContactosCliente(dtoIn);
  }

  @Post('searchCliente')
  // @Auth()
  searchCliente(
    @Body() dtoIn: SearchDto
  ) {
    return this.service.searchCliente(dtoIn);
  }


  @Post('existCliente')
  // @Auth()
  existCliente(
    @Body() dtoIn: ExistClienteDto
  ) {
    return this.service.existCliente(dtoIn);
  }


}
