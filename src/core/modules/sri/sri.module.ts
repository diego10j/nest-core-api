import { Module } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { CoreService } from '../../core.service';
import { ComprobantesElecController } from './cel/comprobantes-elec.controller';
import { ComprobantesElecService } from './cel/comprobantes-elec.service';
import { FirmaController } from './cel/firma.controller';
import { FirmaService } from './cel/firma.service';
import { EmisorController } from './cel/emisor.controller';
import { EmisorService } from './cel/emisor.service';

@Module({
    imports: [],
    controllers: [ComprobantesElecController, FirmaController, EmisorController],
    providers: [ AuditService, CoreService, ComprobantesElecService, FirmaService, EmisorService]
})
export class SriModule { }
