import { BadRequestException } from "@nestjs/common";
import { HeaderParamsDto } from "src/common/dto/common-params.dto";
import { SaveConfigPrecioDto } from "../dto/save-config-precios.dto";
import { isDefined } from "src/util/helpers/common-util";

export function validateUpdateConfigPrecio(dto: SaveConfigPrecioDto & HeaderParamsDto) {
    const configData = dto.data;
    const errors: string[] = [];

    if (!dto.isUpdate) {
        throw new BadRequestException('Esta validación es solo para actualizaciones');
    }

    if (!isDefined(configData.ide_incpa)) {
        errors.push('El ID de configuración (ide_incpa) es requerido para actualización');
    }

    if (!isDefined(configData.ide_inarti)) {
        errors.push('El ID de artículo (ide_inarti) es requerido');
    }

    const isPrecioFijo = isDefined(configData.precio_fijo_incpa);
    const isPorcentaje = isDefined(configData.porcentaje_util_incpa);

    // Validaciones para configuraciones por rango
    if (configData.rangos_incpa === true) {
        if (!isDefined(configData.rango1_cant_incpa)) {
            errors.push('La cantidad mínima es requerida para configuraciones por rango');
        } else if (configData.rango1_cant_incpa! < 0) {
            errors.push('La cantidad mínima no puede ser negativa');
        }

        if (!configData.rango_infinito_incpa) {
            if (!isDefined(configData.rango2_cant_incpa)) {
                errors.push('La cantidad máxima es requerida si el rango no es infinito');
            } else if (configData.rango2_cant_incpa! < 0) {
                errors.push('La cantidad máxima no puede ser negativa');
            } else if (configData.rango2_cant_incpa! < configData.rango1_cant_incpa!) {
                errors.push('La cantidad máxima debe ser mayor o igual que la cantidad mínima');
            }
        }
    } else {
        // Validación para configuraciones exactas
        if (!isDefined(configData.rango1_cant_incpa)) {
            errors.push('La cantidad exacta (rango1_cant_incpa) es requerida cuando no se usa rangos');
        }

        if (isDefined(configData.rango2_cant_incpa) && configData.rango2_cant_incpa !== null) {
            errors.push('La cantidad máxima (rango2_cant_incpa) debe ser nula cuando no se usa rangos');
        }
    }

    if (!isPrecioFijo && !isPorcentaje) {
        errors.push('Debe especificar un precio fijo o un porcentaje de utilidad');
    }

    if (isPrecioFijo && configData.precio_fijo_incpa! < 0) {
        errors.push('El precio fijo no puede ser negativo');
    }

    if (isPorcentaje && configData.porcentaje_util_incpa! < 0) {
        errors.push('El porcentaje de utilidad no puede ser negativo');
    }

    if (configData.observacion_incpa && configData.observacion_incpa.length > 200) {
        errors.push('Las observaciones no pueden exceder los 200 caracteres');
    }

    if (errors.length > 0) {
        throw new BadRequestException(errors);
    }

    return true;
}

export function validateInsertConfigPrecio(data: SaveConfigPrecioDto & HeaderParamsDto) {
    const configData = data.data;
    const errors: string[] = [];

    if ('ide_incpa' in configData) {
        errors.push('El campo ide_incpa no debe enviarse para inserciones (se genera automáticamente)');
    }

    if (!isDefined(configData.ide_inarti)) {
        errors.push('El ID de artículo (ide_inarti) es requerido');
    }

    const isPrecioFijo = isDefined(configData.precio_fijo_incpa);
    const isPorcentaje = isDefined(configData.porcentaje_util_incpa);

    if (configData.rangos_incpa === true) {
        if (!isDefined(configData.rango1_cant_incpa)) {
            errors.push('La cantidad mínima es requerida para configuraciones por rango');
        } else if (configData.rango1_cant_incpa! < 0) {
            errors.push('La cantidad mínima no puede ser negativa');
        }

        if (!configData.rango_infinito_incpa) {
            if (!isDefined(configData.rango2_cant_incpa)) {
                errors.push('La cantidad máxima es requerida si el rango no es infinito');
            } else if (configData.rango2_cant_incpa! < 0) {
                errors.push('La cantidad máxima no puede ser negativa');
            } else if (configData.rango2_cant_incpa! < configData.rango1_cant_incpa!) {
                errors.push('La cantidad máxima debe ser mayor o igual que la cantidad mínima');
            }
        }
    } else {
        if (!isDefined(configData.rango1_cant_incpa)) {
            errors.push('La cantidad exacta (rango1_cant_incpa) es requerida cuando no se usa rangos');
        }

        if (isDefined(configData.rango2_cant_incpa) && configData.rango2_cant_incpa !== null) {
            errors.push('La cantidad máxima (rango2_cant_incpa) debe ser nula cuando no se usa rangos');
        }
    }

    if (!isPrecioFijo && !isPorcentaje) {
        errors.push('Debe especificar un precio fijo o un porcentaje de utilidad');
    }

    if (isPrecioFijo && configData.precio_fijo_incpa! < 0) {
        errors.push('El precio fijo no puede ser negativo');
    }

    if (isPorcentaje && configData.porcentaje_util_incpa! < 0) {
        errors.push('El porcentaje de utilidad no puede ser negativo');
    }

    if (configData.observacion_incpa && configData.observacion_incpa.length > 200) {
        errors.push('Las observaciones no pueden exceder los 200 caracteres');
    }

    if (errors.length > 0) {
        throw new BadRequestException(errors);
    }

    return true;
}
