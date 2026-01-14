import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, Query, SelectQuery } from 'src/core/connection/helpers';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';

import { GenerarOpcionesDto } from './dto/generar-opciones.dto';
import { HorarioDto } from './dto/horario.dto';
import { OpcionDto } from './dto/opcion.dto';
import { PerfilSistemaDto } from './dto/perfil-sistema.dto';
import { PerfilUsuarioDto } from './dto/perfil-usuario.dto';
import { PerfilDto } from './dto/perfil.dto';
import { RucDto } from './dto/ruc.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {}

  // -------------------------------- EMPRESA ---------------------------- //
  async getListDataEmpresa(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = { ...dto, module: 'sis', tableName: 'empresa', primaryKey: 'ide_empr', columnLabel: 'nom_empr' };
    return this.core.getListDataValues(dtoIn);
  }

  async getTableQueryEmpresa(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = { ...dto, module: 'sis', tableName: 'empresa', primaryKey: 'ide_empr' };
    return this.core.getTableQuery(dtoIn);
  }

  async getEmpresaByRuc(dtoIn: RucDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        select
            ide_empr,
            nom_empr,
            identificacion_empr,
            nom_corto_empr,
            mail_empr,
            logotipo_empr
        from
            sis_empresa
        where
            identificacion_empr = $1
            `);
    query.addStringParam(1, dtoIn.ruc);
    const res = await this.dataSource.createSingleQuery(query);
    if (res === null) {
      throw new BadRequestException(`La empresa no existe`);
    }
    return res;
  }

  // -------------------------------- SUCURSAL ---------------------------- //
  async getListDataSucursal(dto: QueryOptionsDto & HeaderParamsDto) {
    const condition = `ide_empr = ${dto.ideEmpr}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'sucursal',
      primaryKey: 'ide_sucu',
      columnLabel: 'nom_sucu',
      condition,
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getTableQuerySucursal(dto: QueryOptionsDto & HeaderParamsDto) {
    const condition = `ide_empr = ${dto.ideEmpr}`;
    const dtoIn = { ...dto, module: 'sis', tableName: 'sucursal', primaryKey: 'ide_sucu', condition };
    return this.core.getTableQuery(dtoIn);
  }

  // -------------------------------- SISTEMAS ---------------------------- //
  async getListDataSistema(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = { ...dto, module: 'sis', tableName: 'sistema', primaryKey: 'ide_sist', columnLabel: 'nombre_sist' };
    return this.core.getListDataValues(dtoIn);
  }

  async getTableQuerySistema(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = { ...dto, module: 'sis', tableName: 'sistema', primaryKey: 'ide_sist' };
    return this.core.getTableQuery(dtoIn);
  }

  // -------------------------------- OPCIONES ---------------------------- //
  async getTableQueryOpcion(dto: OpcionDto & HeaderParamsDto) {
    const whereClause = `ide_sist = ${dto.ide_sist} AND ${isDefined(dto.sis_ide_opci) === false ? 'sis_ide_opci IS NULL' : `sis_ide_opci = ${dto.sis_ide_opci}`}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'opcion',
      primaryKey: 'ide_opci',
      condition: `${whereClause}`,
      orderBy: { column: 'nom_opci' },
    };
    return this.core.getTableQuery(dtoIn);
  }

  async getTreeModelOpcion(dto: OpcionDto & HeaderParamsDto) {
    const whereClause = `ide_sist = ${dto.ide_sist}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'opcion',
      primaryKey: 'ide_opci',
      columnName: 'nom_opci',
      columnNode: 'sis_ide_opci',
      condition: `${whereClause}`,
      orderBy: { column: 'nom_opci' },
    };
    return this.core.getTreeModel(dtoIn);
  }

  /**
   * Genera el menu de opciones del sistema ProErp a partir de un json elaborado en el frontend
   * @param dtoIn
   * @returns
   */
  async generarOpciones(dtoIn: GenerarOpcionesDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
      SELECT * FROM f_generar_opciones_proerp($1, $2)
      `,
    );
    const jsonString = JSON.stringify(dtoIn.json);
    query.addParam(1, jsonString);
    query.addParam(2, dtoIn.login);
    const rows = await this.dataSource.createSelectQuery(query);
    return {
      rowCount: rows.length,
      data: rows,
      message: 'ok',
    } as ResultQuery;
  }

  // -------------------------------- PERFILES ---------------------------- //
  async getTableQueryPerfil(dto: PerfilDto & HeaderParamsDto) {
    const whereClause = `ide_sist = ${dto.ide_sist}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'perfil',
      primaryKey: 'ide_perf',
      condition: `${whereClause}`,
      orderBy: { column: 'nom_perf' },
    };
    return this.core.getTableQuery(dtoIn);
  }

  async getPerfilesSistema(dtoIn: PerfilDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        SELECT
            a.ide_perf,
            nom_perf,
            nombre_corto_sist
        FROM
            sis_perfil a
            INNER JOIN sis_sistema b ON a.ide_sist = b.ide_sist
        WHERE
            a.ide_sist = $1
        ORDER BY
            nom_perf
            `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_sist);
    return await this.dataSource.createQuery(query);
  }

  async getListDataPerfilesSistema(dto: PerfilDto & HeaderParamsDto) {
    const condition = `ide_sist = ${dto.ide_sist}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'perfil',
      primaryKey: 'ide_perf',
      columnLabel: 'nom_perf',
      condition,
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getOpcionesPerfil(
    dtoIn: PerfilSistemaDto & HeaderParamsDto,
  ): Promise<{ opcionesArray: string[]; rows: any[] }> {
    const query = new SelectQuery(`
            SELECT o.ide_peop,
                   o.ide_opci
            FROM
                sis_perfil_opcion o
                INNER JOIN sis_perfil p ON o.ide_perf = p.ide_perf
            WHERE
                o.ide_perf = $1
                AND o.ide_opci IS NOT NULL
                AND p.ide_sist = $2
            ORDER BY
                o.ide_opci
        `);
    query.addIntParam(1, dtoIn.ide_perf);
    query.addIntParam(2, dtoIn.ide_sist);

    const result = await this.dataSource.createSelectQuery(query);

    // Si no hay resultados, retornar objeto con arrays vacíos
    if (!result || result.length === 0) {
      return {
        opcionesArray: [],
        rows: [],
      };
    }

    // Convertir a array de strings únicos
    const opcionesArray: string[] = [...new Set(result.map((row) => row.ide_opci.toString()))];

    return {
      opcionesArray,
      rows: result,
    };
  }

  async saveOpcionesPerfil(dtoIn: PerfilSistemaDto & HeaderParamsDto) {
    // Validar que vengan opciones
    if (!dtoIn.opciones || !Array.isArray(dtoIn.opciones)) {
      throw new BadRequestException('El campo opciones es requerido y debe ser un array');
    }
    // 1. Obtener datos existentes
    const { opcionesArray: opcionesExistentes, rows } = await this.getOpcionesPerfil(dtoIn);

    // 2. Obtener array de nuevas opciones del DTO
    const nuevasOpciones = dtoIn.opciones.map((op) => op.toString());

    // 3. Encontrar diferencias
    const opcionesAEliminar = opcionesExistentes.filter((op) => !nuevasOpciones.includes(op));
    const opcionesAInsertar = nuevasOpciones.filter((op) => !opcionesExistentes.includes(op));

    // 4. Obtener los IDs a eliminar buscando en los rows
    const idsAEliminar = rows
      .filter((row) => opcionesAEliminar.includes(row.ide_opci.toString()))
      .map((row) => row.ide_peop);

    const listQuery: Query[] = [];
    // Elimina
    if (opcionesAEliminar.length > 0) {
      this.buildDeleteOpcionesPerfil(dtoIn, idsAEliminar, listQuery);
    }

    if (opcionesAInsertar.length > 0) {
      await this.buildInsertOpcionesPerfil(dtoIn, opcionesAInsertar, listQuery);
    }

    const resultMessage = await this.dataSource.createListQuery(listQuery);
    return {
      success: true,
      message: 'Opciones guardadas correctamente',
      data: {
        totalQueries: listQuery.length,
        resultMessage,
      },
    };
  }

  // -------------------------------- HORARIOS ---------------------------- //
  async getListDataTiposHorario(dto: QueryOptionsDto & HeaderParamsDto) {
    const condition = `ide_empr = ${dto.ideEmpr}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'tipo_horario',
      primaryKey: 'ide_tihor',
      columnLabel: 'nombre_tihor',
      condition,
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getTableQueryTiposHorario(dto: QueryOptionsDto & HeaderParamsDto) {
    const condition = `ide_empr = ${dto.ideEmpr}`;
    const dtoIn = { ...dto, module: 'sis', tableName: 'tipo_horario', primaryKey: 'ide_tihor', condition };
    return this.core.getTableQuery(dtoIn);
  }

  async getTableQueryHorario(dto: HorarioDto & HeaderParamsDto) {
    const condition = `ide_empr = ${dto.ideEmpr} and ide_tihor=${dto.ide_tihor}`;
    const dtoIn = { ...dto, module: 'sis', tableName: 'horario', primaryKey: 'ide_hora', condition };
    return this.core.getTableQuery(dtoIn);
  }

  async getTableQueryPerfilesUsuario(dto: PerfilUsuarioDto & HeaderParamsDto) {
    if (dto.uuid) {
      const query = new SelectQuery(
        `
          SELECT
              ide_usua
          FROM
              sis_usuario
          WHERE
              uuid = $1
              `,
      );
      query.addParam(1, dto.uuid);
      const res = await this.dataSource.createSingleQuery(query);
      if (!res) {
        throw new NotFoundException(`Usuario con uuid '${dto.uuid}' no encontrado`);
      }
      dto.ide_usua = res.ide_usua;
    }

    // Validar que ahora tenemos ide_usua
    if (isDefined(dto.ide_usua) === false) {
      throw new BadRequestException('No se pudo determinar el ID de usuario');
    }

    const whereClause = `ide_sist = ${dto.ide_sist} AND ide_usua = ${dto.ide_usua}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'usuario_perfil',
      primaryKey: 'ide_usper',
      condition: `${whereClause}`,
      orderBy: { column: 'ide_perf' },
    };
    return this.core.getTableQuery(dtoIn);
  }

  // ============ QUERY BUILDERS ============

  private buildDeleteOpcionesPerfil(
    dto: PerfilSistemaDto & HeaderParamsDto,
    opcionesAEliminar: any[],
    listQuery: Query[],
  ) {
    for (const opcion of opcionesAEliminar) {
      const deleteQuery = new DeleteQuery('sis_perfil_opcion', dto);
      deleteQuery.where = `ide_peop =$1`;
      deleteQuery.addParam(1, opcion);
      // auditoria
      deleteQuery.ide = opcion;
      deleteQuery.audit = true;
      listQuery.push(deleteQuery);
    }
  }

  private async buildInsertOpcionesPerfil(
    dtoIn: PerfilSistemaDto & HeaderParamsDto,
    opcionesAInsertar: string[],
    listQuery: Query[],
  ) {
    let seq = await this.getNextOpcionPerfilId(dtoIn, opcionesAInsertar.length);
    for (const opcion of opcionesAInsertar) {
      const insertQuery = new InsertQuery('sis_perfil_opcion', 'ide_peop', dtoIn);
      insertQuery.values.set('ide_peop', seq);
      insertQuery.values.set('ide_perf', dtoIn.ide_perf);
      insertQuery.values.set('ide_sist', dtoIn.ide_sist);
      insertQuery.values.set('ide_opci', opcion);
      insertQuery.values.set('lectura_peop', false);
      insertQuery.audit = true;
      listQuery.push(insertQuery);
      seq++;
    }
  }

  private async getNextOpcionPerfilId(dtoIn: HeaderParamsDto, regitros: number): Promise<number> {
    return this.dataSource.getSeqTable('sis_perfil_opcion', 'ide_peop', regitros, dtoIn.login);
  }
}
