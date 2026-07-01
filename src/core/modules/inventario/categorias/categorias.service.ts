import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { DeleteEtiquetaCategoriaDto } from './dto/delete-etiqueta-categoria.dto';
import { GetEtiquetasCategoriaDto } from './dto/get-etiquetas-categoria.dto';
import { SaveEtiquetasCategoriaDto } from './dto/save-etiquetas-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(private readonly dataSource: DataSourceService) { }

  async getEtiquetasByCategoria(dtoIn: GetEtiquetasCategoriaDto & HeaderParamsDto) {
    const result = await this.dataSource.pool.query(
      `SELECT etiquetas_incate FROM inv_categoria WHERE ide_incate = $1 AND ide_empr = $2`,
      [dtoIn.ide_incate, dtoIn.ideEmpr],
    );

    if (result.rowCount === 0) {
      throw new BadRequestException('Categoría no encontrada');
    }

    const raw = result.rows[0].etiquetas_incate;
    let etiquetas: string[] = [];
    if (raw) {
      try {
        etiquetas = JSON.parse(raw);
      } catch {
        etiquetas = [];
      }
    }

    return { etiquetas };
  }

  async saveEtiquetasCategoria(dtoIn: SaveEtiquetasCategoriaDto & HeaderParamsDto) {
    const etiquetasJson = JSON.stringify(dtoIn.etiquetas);

    const result = await this.dataSource.pool.query(
      `UPDATE inv_categoria SET etiquetas_incate = $1 WHERE ide_incate = $2 AND ide_empr = $3`,
      [etiquetasJson, dtoIn.ide_incate, dtoIn.ideEmpr],
    );

    if (result.rowCount === 0) {
      throw new BadRequestException('Categoría no encontrada');
    }

    return { message: 'ok', rowCount: result.rowCount };
  }

  async deleteEtiquetaCategoria(dtoIn: DeleteEtiquetaCategoriaDto & HeaderParamsDto) {
    const { rows } = await this.dataSource.pool.query(
      `SELECT etiquetas_incate FROM inv_categoria WHERE ide_incate = $1 AND ide_empr = $2`,
      [dtoIn.ide_incate, dtoIn.ideEmpr],
    );

    if (rows.length === 0) {
      throw new BadRequestException('Categoría no encontrada');
    }

    const raw = rows[0].etiquetas_incate;
    let etiquetas: string[] = [];
    if (raw) {
      try {
        etiquetas = JSON.parse(raw);
      } catch {
        etiquetas = [];
      }
    }

    const updated = etiquetas.filter((e) => e !== dtoIn.etiqueta);

    if (updated.length === etiquetas.length) {
      throw new BadRequestException('Etiqueta no encontrada en la categoría');
    }

    const etiquetasJson = JSON.stringify(updated);
    await this.dataSource.pool.query(
      `UPDATE inv_categoria SET etiquetas_incate = $1 WHERE ide_incate = $2 AND ide_empr = $3`,
      [etiquetasJson, dtoIn.ide_incate, dtoIn.ideEmpr],
    );

    return { message: 'ok', rowCount: 1 };
  }
}
