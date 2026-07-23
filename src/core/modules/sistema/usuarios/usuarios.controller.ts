import fs from 'node:fs';
import path from 'node:path';

import { Query, Controller, Get, Post, Body, Param, NotFoundException, Res, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { Auth, GetUser } from 'src/core/auth';
import { AuthUser } from 'src/core/auth/interfaces';
import { fileNamer, fileFilter } from 'src/core/modules/sistema/files/helpers';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { ChangePasswordPerfilDto } from './dto/change-password-perfil.dto';
import { ConfigPasswordDto } from './dto/config-password.dto';
import { PerfilUsuarioDto } from './dto/perfil-usuario.dto';
import { UpdatePerfilUsuarioDto } from './dto/update-perfil-usuario.dto';
import { UsuarioDto } from './dto/usuario.dto';
import { UsuariosService } from './usuarios.service';

const USUARIOS_DIR = path.join(envs.pathDrive, 'usuarios');
fs.mkdirSync(USUARIOS_DIR, { recursive: true });

@ApiTags('Sistema-Usuarios')
@Controller('sistema/usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) { }

  @Get('getUsuarios')
  @ApiOperation({ summary: 'Listar usuarios del sistema' })
  @Auth()
  getProductos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getUsuarios({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryUsuarioByUuid')
  @ApiOperation({ summary: 'Obtener datos de un usuario por UUID' })
  @Auth()
  getTableQueryUsuarioByUuid(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UsuarioDto) {
    return this.service.getTableQueryUsuarioByUuid({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataUsuario')
  @ApiOperation({ summary: 'Obtener listado de usuarios para selector' })
  @Auth()
  getListDataUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getListDataUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }


  @Get('getTableQueryPerfilesUsuario')
  @ApiOperation({ summary: 'Obtener perfiles asignados a un usuario' })
  @Auth()
  getTableQueryPerfilesUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getTableQueryPerfilesUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQuerySucursalesUsuario')
  @ApiOperation({ summary: 'Obtener sucursales asignadas a un usuario' })
  @Auth()
  getTableQuerySucursalesUsuario(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getTableQuerySucursalesUsuario({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getConfigPassword')
  @ApiOperation({ summary: 'Obtener configuración de política de contraseñas de un usuario' })
  @Auth()
  getConfigPassword(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PerfilUsuarioDto) {
    return this.service.getConfigPassword({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveConfigPassword')
  @ApiOperation({ summary: 'Guardar configuración de política de contraseñas para un usuario' })
  @Auth()
  saveConfigPassword(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ConfigPasswordDto) {
    return this.service.saveConfigPassword({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('updatePerfilUsuario')
  @ApiOperation({ summary: 'Actualizar datos del perfil del usuario autenticado (nom_usua, avatar_usua)' })
  @Auth()
  updatePerfilUsuario(
    @AppHeaders() headersParams: HeaderParamsDto,
    @GetUser() user: AuthUser,
    @Body() dtoIn: UpdatePerfilUsuarioDto,
  ) {
    return this.service.updatePerfilUsuario(dtoIn, user.ide_usua, headersParams.login);
  }

  @Post('changePasswordPerfil')
  @ApiOperation({ summary: 'Cambiar contraseña del usuario autenticado (requiere contraseña actual, nueva y confirmación)' })
  @Auth()
  changePasswordPerfil(
    @AppHeaders() headersParams: HeaderParamsDto,
    @GetUser() user: AuthUser,
    @Body() dtoIn: ChangePasswordPerfilDto,
  ) {
    return this.service.changePasswordPerfil(dtoIn, user.ide_usua, headersParams.login);
  }

  @Get('getPerfilUsuario')
  @ApiOperation({ summary: 'Obtener datos completos del perfil del usuario autenticado (datos, roles, sucursales, última conexión, cuenta de correo)' })
  @Auth()
  getPerfilUsuario(
    @AppHeaders() headersParams: HeaderParamsDto,
    @GetUser() user: AuthUser,
  ) {
    return this.service.getPerfilUsuario(user.ide_usua, headersParams.ideEmpr);
  }

  @Post('uploadAvatar')
  @Auth()
  @ApiOperation({ summary: 'Subir imagen de avatar de perfil del usuario autenticado' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (jpg, jpeg, png, gif, webp)',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: USUARIOS_DIR,
        filename: fileNamer,
      }),
      fileFilter,
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @AppHeaders() headersParams: HeaderParamsDto,
    @GetUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadAvatar(file, user.ide_usua, headersParams.login);
  }

  @Get('getAvatar/:fileName')
  @ApiOperation({ summary: 'Obtener imagen de avatar de perfil con soporte para thumbnail (?w=N). Si no existe retorna avatar.png' })
  async getAvatar(
    @Param('fileName') fileName: string,
    @Query('w') width?: string,
    @Res() res?: any,
  ) {
    let filePath = path.join(USUARIOS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(USUARIOS_DIR, 'avatar.png');
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException('Imagen de avatar no encontrada');
      }
    }

    const w = width ? parseInt(width, 10) : undefined;
    if (!w) {
      return res.sendFile(filePath);
    }

    if (w < 32 || w > 1024) {
      throw new BadRequestException('El ancho debe estar entre 32 y 1024 píxeles');
    }

    const ext = path.extname(fileName) || '.png';
    const nameNoExt = path.basename(fileName, ext);
    const newExtension = '.webp';
    const cachedName = `w${w}_${nameNoExt}${newExtension}`;
    const cachedPath = path.join(USUARIOS_DIR, cachedName);

    if (fs.existsSync(cachedPath)) {
      res.setHeader('Content-Type', 'image/webp');
      return res.sendFile(cachedPath);
    }

    try {
      const sharp = (await import('sharp')).default;
      const buffer = await sharp(filePath)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      await fs.promises.writeFile(cachedPath, buffer);
      res.setHeader('Content-Type', 'image/webp');
      res.send(buffer);
    } catch {
      res.sendFile(filePath);
    }
  }

  @Get('getAvatarsDisponibles')
  @ApiOperation({ summary: 'Listar avatars predefinidos disponibles (6 hombres, 6 mujeres, 1 default)' })
  @Auth()
  getAvatarsDisponibles() {
    const hostApi = envs.hostApi;
    const baseUrl = `${hostApi}/api/sistema/usuarios/getAvatar`;
    const makeUrls = (fileName: string) => ({
      original: `${baseUrl}/${fileName}`,
      thumbnail: `${baseUrl}/${fileName}?w=80`,
    });
    const hombres = Array.from({ length: 6 }, (_, i) => {
      const fileName = `avatar_h_${i + 1}.png`;
      return {
        id: `avatar_h_${i + 1}`,
        nombre: `Avatar Hombre ${i + 1}`,
        fileName,
        ...makeUrls(fileName),
      };
    });
    const mujeres = Array.from({ length: 6 }, (_, i) => {
      const fileName = `avatar_m_${i + 1}.png`;
      return {
        id: `avatar_m_${i + 1}`,
        nombre: `Avatar Mujer ${i + 1}`,
        fileName,
        ...makeUrls(fileName),
      };
    });
    return {
      default: {
        id: 'default',
        nombre: 'Avatar por defecto',
        fileName: 'avatar.png',
        ...makeUrls('avatar.png'),
      },
      hombres,
      mujeres,
    };
  }

}
