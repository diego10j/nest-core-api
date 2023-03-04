import { DataSource } from 'typeorm';
import { ColumnasTablaDto } from './dto/columnas-tabla.dto';
import { UtilitarioService } from '../utilitario/utilitario.service';
export declare class ConexionService {
    private readonly dataSource;
    private readonly utilitario;
    private readonly logger;
    constructor(dataSource: DataSource, utilitario: UtilitarioService);
    getColumnasTabla(dto: ColumnasTablaDto): Promise<any>;
    consultaSQL(dto: ColumnasTablaDto): Promise<void>;
}
