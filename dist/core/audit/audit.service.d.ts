import { DataSourceService } from '../connection/datasource.service';
export declare class AuditService {
    private readonly dataSource;
    constructor(dataSource: DataSourceService);
    saveAccessAudit(ide_usua: number, ide_acau: number, ip: string, detalle_auac: string, dispositivo: string, fin_auac?: boolean): Promise<void>;
}
