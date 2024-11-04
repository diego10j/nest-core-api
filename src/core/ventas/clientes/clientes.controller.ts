import { Body, Controller, Post } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { TrnClienteDto } from './dto/trn-cliente.dto';
import { IdClienteDto } from './dto/id-cliente.dto';
import { IVentasMensualesClienteDto } from './dto/ventas-mensuales.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';

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


}
