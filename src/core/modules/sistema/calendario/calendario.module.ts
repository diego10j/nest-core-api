import { Module } from '@nestjs/common';
import { CalendarioService } from './calendario.service';
import { CalendarioController } from './calendario.controller';

@Module({
  imports: [],
  controllers: [CalendarioController],
  providers: [CalendarioService],
})
export class CalendarioModule { }
