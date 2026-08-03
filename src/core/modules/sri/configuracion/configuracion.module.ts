import { Module } from '@nestjs/common';

import { CoreService } from '../../../core.service';

import { ConfiguracionSaveService } from './configuracion-save.service';
import { ConfiguracionController } from './configuracion.controller';
import { ConfiguracionService } from './configuracion.service';

@Module({
    controllers: [ConfiguracionController],
    providers: [ConfiguracionService, ConfiguracionSaveService, CoreService],
    exports: [ConfiguracionService, ConfiguracionSaveService],
})
export class ConfiguracionModule { }
