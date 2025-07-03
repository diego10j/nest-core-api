import { BadRequestException } from "@nestjs/common";
import { HeaderParamsDto } from "src/common/dto/common-params.dto";
import { SaveConfigPrecioDto } from "../dto/save-config-precios.dto";
import { isDefined } from "src/util/helpers/common-util";


export function validateUpdateConfigPrecio(dto: SaveConfigPrecioDto & HeaderParamsDto) {
    const configData = dto.data;
    const errors: string[] = [];

    // Validación básica del DTO (ya cubierta por class-validator pero verificamos por si acaso)
    if (!dto.isUpdate) {
        throw new BadRequestException('Esta validación es solo para actualizaciones');
    }

    // Campos obligatorios para actualización
    if (isDefined(configData.ide_incpa) === false) {
        errors.push('El ID de configuración (ide_incpa) es requerido para actualización');
    }

    // Validación de campos requeridos para inserción
    if (isDefined(configData.ide_inarti) === false) {
        errors.push('El ID de artículo (ide_inarti) es requerido');
    }

    // Validaciones específicas para actualización
    if (isDefined(configData.rangos_incpa)) {
        // Validaciones para configuración por rangos
        if (isDefined(configData.rango1_cant_incpa) && configData.rango1_cant_incpa < 0) {
            errors.push('La cantidad mínima no puede ser negativa');
        }

        if (!configData.rango_infinito_incpa &&
            configData.rango2_cant_incpa !== undefined &&
            configData.rango2_cant_incpa < 0) {
            errors.push('La cantidad máxima no puede ser negativa');
        }

        if (configData.rango1_cant_incpa !== undefined &&
            configData.rango2_cant_incpa !== undefined &&
            !configData.rango_infinito_incpa &&
            configData.rango2_cant_incpa < configData.rango1_cant_incpa) {
            errors.push('La cantidad máxima debe ser mayor o igual que la cantidad mínima');
        }
    }
    if (isDefined(configData.porcentaje_util_incpa)) {
        // Validaciones por porcentaje de utilidad
        if (configData.porcentaje_util_incpa < 0) {
            errors.push('El porcentaje de utilidad no puede ser negativo');
        }
    }
    else {
        // Validaciones para precio fijo
        if (isDefined(configData.precio_fijo_incpa) === false) {
            errors.push('El precio fijo es requerido para configuraciones sin rangos');
        } else if (configData.precio_fijo_incpa < 0) {
            errors.push('El precio fijo no puede ser negativo');
        }
    }


    // Validación de longitud para observaciones
    if (configData.observacion_incpa !== undefined && configData.observacion_incpa.length > 200) {
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

    // Validar que no venga ide_incpa en inserción
    if ('ide_incpa' in configData) {
        errors.push('El campo ide_incpa no debe enviarse para inserciones (se genera automáticamente)');
    }

    // Validación de campos requeridos para inserción
    if (isDefined(configData.ide_inarti) === false) {
        errors.push('El ID de artículo (ide_inarti) es requerido');
    }

    // Validación de rangos
    if (configData.rangos_incpa) {
        if (isDefined(configData.rango1_cant_incpa) === false) {
            errors.push('La cantidad mínima es requerida para configuraciones por rango');
        } else if (configData.rango1_cant_incpa < 0) {
            errors.push('La cantidad mínima no puede ser negativa');
        }

        if (!configData.rango_infinito_incpa && (configData.rango2_cant_incpa === undefined || configData.rango2_cant_incpa === null)) {
            errors.push('La cantidad máxima es requerida cuando no es rango infinito');
        } else if (configData.rango2_cant_incpa !== undefined && configData.rango2_cant_incpa !== null) {
            if (configData.rango2_cant_incpa < 0) {
                errors.push('La cantidad máxima no puede ser negativa');
            }
            if (configData.rango1_cant_incpa !== undefined &&
                configData.rango1_cant_incpa !== null &&
                configData.rango2_cant_incpa < configData.rango1_cant_incpa) {
                errors.push('La cantidad máxima debe ser mayor o igual que la cantidad mínima');
            }
        }
    }

    if (isDefined(configData.porcentaje_util_incpa)) {
        // Validaciones por porcentaje de utilidad
        if (configData.porcentaje_util_incpa < 0) {
            errors.push('El porcentaje de utilidad no puede ser negativo');
        }
    }
    else {
        if (isDefined(configData.precio_fijo_incpa) === false) {
            errors.push('El precio fijo es requerido para configuraciones sin rangos');
        } else if (configData.precio_fijo_incpa < 0) {
            errors.push('El precio fijo no puede ser negativo');
        }
    }

    // Validación de longitud para observaciones
    if (configData.observacion_incpa && configData.observacion_incpa.length > 200) {
        errors.push('Las observaciones no pueden exceder los 200 caracteres');
    }

    if (errors.length > 0) {
        throw new BadRequestException(errors);
    }

    return true;
}

