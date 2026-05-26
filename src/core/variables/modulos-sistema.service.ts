import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';

import { SaveModuloDto } from './dto/save-modulo.dto';

@Injectable()
export class ModulosSistemaService {
  private readonly MODULE = 'sis';
  private readonly TABLE_NAME = 'modulo';
  private readonly PRIMARY_KEY = 'ide_modu';
  private readonly COLUMN_LABEL = 'nom_modu';

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {}

  async getListData(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: this.MODULE,
      tableName: this.TABLE_NAME,
      primaryKey: this.PRIMARY_KEY,
      columnLabel: this.COLUMN_LABEL,
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getTableQuery(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: this.MODULE,
      tableName: this.TABLE_NAME,
      primaryKey: this.PRIMARY_KEY,
    };
    return this.core.getTableQuery(dtoIn);
  }

  async save(dtoIn: SaveModuloDto & HeaderParamsDto) {
    const {
      ide_modu: ideModu,
      nom_modu: nomModu,
    } = dtoIn;

    const isUpdate = ideModu != null;

    const objQuery: ObjectQueryDto = {
      operation: isUpdate ? 'update' : 'insert',
      module: this.MODULE,
      tableName: this.TABLE_NAME,
      primaryKey: this.PRIMARY_KEY,
      object: isUpdate
        ? { ide_modu: ideModu, nom_modu: nomModu }
        : { nom_modu: nomModu },
      condition: isUpdate ? `ide_modu = ${ideModu}` : undefined,
    };

    return this.core.save({ ...dtoIn, listQuery: [objQuery], audit: true });
  }
}
