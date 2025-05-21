// src/common/decorators/app-headers.decorator.ts
import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { HeaderParamsDto } from '../dto/common-params.dto';

export const AppHeaders = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    const headers = {
      ideUsua: Number(request.headers['x-ide-usua']),
      ideEmpr: Number(request.headers['x-ide-empr']),
      ideSucu: Number(request.headers['x-ide-sucu']),
      idePerf: Number(request.headers['x-ide-perf']),
      login: request.headers['x-login'],
      ip: request.headers['x-ip'],
      device: request.headers['x-device']
    };

    const headersInstance = plainToInstance(HeaderParamsDto, headers);
    const errors = validateSync(headersInstance);

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Headers validation failed',
        errors: errors.map(err => ({
          field: err.property,
          message: Object.values(err.constraints || {}).join(', ')
        }))
      });
    }

    return headersInstance; // Retorna la instancia validada
  }
);


