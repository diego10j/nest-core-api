import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { BaseService } from '../../common/base-service';
import { fToTitleCase } from '../../util/helpers/string-util';
import { DataSourceService } from '../connection/datasource.service';
import { SelectQuery } from '../connection/helpers/select-query';

import { RadialBarDto } from './dto/radial-bar.dto';

@Injectable()
export class ChartsService extends BaseService {
  constructor(private readonly dataSource: DataSourceService) {
    super();
  }

  /**
   * Genera la data para un chart de tipo radialBar
   * @param dtoIn
   * @returns
   */
  async radialBar(dtoIn: RadialBarDto & HeaderParamsDto) {
    const conditionLabel = dtoIn.conditionLabel ? ` AND ${dtoIn.conditionLabel}` : '';

    const query = new SelectQuery(`
    select
        (
            select count(1) from ${dtoIn.tableValue} where ide_empr = ${dtoIn.ideEmpr} ) as total,
        json_agg(
            json_build_object(
                'label',
                subquery.label,
                'value',
                subquery.value
            )
        ) as chart,
        (select count(1) from  ${dtoIn.tableValue} where ${dtoIn.primaryKey} is null and ide_empr = ${dtoIn.ideEmpr} ) as empty
    from
        (
            select
                a.${dtoIn.columnLabel} as label,
                count(b.${dtoIn.primaryKey}) as value
            from
                ${dtoIn.tableLabel} a
                left join ${dtoIn.tableValue} b on a.${dtoIn.primaryKey} = b.${dtoIn.primaryKey}
            where a.ide_empr = ${dtoIn.ideEmpr} ${conditionLabel}
            group by
                a.${dtoIn.columnLabel}
            order by
                a.${dtoIn.columnLabel}
        ) as subquery
        `);

    const result: any = this.dataSource.createSelectQuery(query);
    const total = result[0].total;
    const empty = result[0].empty;
    const chart = result[0].chart.map((item) => ({
      label: fToTitleCase(item.label),
      value: item.value,
    }));
    if (Number(empty) > 0) {
      chart.push({
        label: fToTitleCase('No Asignados'),
        value: empty,
      });
    }

    return {
      total,
      chart: { series: chart },
    };
  }
}
