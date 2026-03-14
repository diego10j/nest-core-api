import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { GetProformaDto } from 'src/core/modules/proformas/dto/get-proforma.dto';
import { ProformasService } from 'src/core/modules/proformas/proformas.service';
import { SectionsService } from 'src/reports/common/services/sections.service';
import { PrinterService } from 'src/reports/printer/printer.service';

import { proformaReport } from './proforma.report';
import { ProformaRep } from './interfaces/proforma-rep';

@Injectable()
export class ProformasRepService {
    constructor(
        private readonly printerService: PrinterService,
        private readonly proformasService: ProformasService,
        private readonly sectionsService: SectionsService,
    ) { }

    async reportProforma(dtoIn: GetProformaDto & HeaderParamsDto) {
        const proforma = await this.proformasService.getProformaByID(dtoIn) as ProformaRep;

        const header = await this.sectionsService.createReportHeader({
            ideEmpr: dtoIn.ideEmpr,
            showDate: true,
        });

        const docDefinition = proformaReport(proforma, header);

        return this.printerService.createPdf(docDefinition);
    }
}