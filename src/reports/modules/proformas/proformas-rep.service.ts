import * as path from 'path';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Piscina from 'piscina';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { GetProformaDto } from 'src/core/modules/proformas/dto/get-proforma.dto';
import { ProformasService } from 'src/core/modules/proformas/proformas.service';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';

import { ProformaRep } from './interfaces/proforma-rep';

@Injectable()
export class ProformasRepService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ProformasRepService.name);
    private pool: Piscina;

    constructor(
        private readonly proformasService: ProformasService,
        private readonly empresaRepService: EmpresaRepService,
    ) { }

    onModuleInit() {
        const isTs = __filename.endsWith('.ts');
        const workerFile = path.join(
            __dirname,
            isTs ? 'proforma-pdf.worker.ts' : 'proforma-pdf.worker.js',
        );
        const execArgv = isTs
            ? ['--require', 'ts-node/register', '--require', 'tsconfig-paths/register']
            : [];

        // minThreads=1 mantiene al menos un worker pre-calentado siempre listo.
        this.pool = new Piscina({
            filename: workerFile,
            execArgv,
            minThreads: 1,
            maxThreads: 4,
            idleTimeout: 60_000,
        });
        this.logger.log('Pool de workers PDF inicializado');
    }

    async onModuleDestroy() {
        await this.pool.destroy();
    }

    async reportProforma(dtoIn: GetProformaDto & HeaderParamsDto): Promise<Buffer> {
        const t0 = Date.now();

        const [proforma, empresa] = await Promise.all([
            this.proformasService.getProformaByID(dtoIn),
            this.empresaRepService.getEmpresaById(dtoIn.ideEmpr),
        ]);
        this.logger.log(`[reportProforma] DB + empresa: ${Date.now() - t0}ms`);

        const t1 = Date.now();
        const buffer: Buffer = await this.pool.run({ proforma: proforma as ProformaRep, empresa });
        this.logger.log(`[reportProforma] Worker pool (render PDF): ${Date.now() - t1}ms`);
        this.logger.log(`[reportProforma] TOTAL: ${Date.now() - t0}ms`);

        return buffer;
    }
}