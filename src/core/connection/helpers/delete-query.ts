import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { Query } from './query';

export class DeleteQuery extends Query {
  table: string;
  primaryKey: string;
  where: string;
  ide: string | number;
  header: HeaderParamsDto;

  constructor(table: string, dto?: HeaderParamsDto) {
    super();
    this.table = table.toLowerCase();
    if (dto) {
      this.header = dto;
    }
  }
}
