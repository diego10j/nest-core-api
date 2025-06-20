import { BadRequestException } from "@nestjs/common";
import { HeaderParamsDto } from "src/common/dto/common-params.dto";
import { SaveConfigPrecioDto } from "../dto/save-config-precios.dto";


export function validateUpdateConfigPrecio(dto: SaveConfigPrecioDto & HeaderParamsDto) {
    const configData = dto.data;
    const errors: string[] = [];

    // Validación básica del DTO (ya cubierta por class-validator pero verificamos por si acaso)
    if (!dto.isUpdate) {
        throw new BadRequestException('Esta validación es solo para actualizaciones');
    }

    // Campos obligatorios para actualización
    if (configData.ide_incpa === undefined || configData.ide_incpa === null) {
        errors.push('El ID de configuración (ide_incpa) es requerido para actualización');
    }

    // Validaciones específicas para actualización
    if (configData.rangos_incpa) {
        // Validaciones para configuración por rangos
        if (configData.rango1_cant_incpa !== undefined && configData.rango1_cant_incpa < 0) {
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
            configData.rango2_cant_incpa <= configData.rango1_cant_incpa) {
            errors.push('La cantidad máxima debe ser mayor que la cantidad mínima');
        }

        if (configData.porcentaje_util_incpa !== undefined && configData.porcentaje_util_incpa < 0) {
            errors.push('El porcentaje de utilidad no puede ser negativo');
        }

        if (configData.precio_fijo_incpa !== undefined) {
            errors.push('No se puede especificar precio fijo en una configuración por rangos');
        }
    } else {
        // Validaciones para precio fijo
        if (configData.precio_fijo_incpa !== undefined && configData.precio_fijo_incpa < 0) {
            errors.push('El precio fijo no puede ser negativo');
        }

        if (configData.porcentaje_util_incpa !== undefined) {
            errors.push('No se puede especificar porcentaje de utilidad en una configuración de precio fijo');
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
    if (configData.ide_inarti === undefined || configData.ide_inarti === null) {
        errors.push('El ID de artículo (ide_inarti) es requerido');
    }

    // Validación de rangos
    if (configData.rangos_incpa) {
        if (configData.rango1_cant_incpa === undefined || configData.rango1_cant_incpa === null) {
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
                configData.rango2_cant_incpa <= configData.rango1_cant_incpa) {
                errors.push('La cantidad máxima debe ser mayor que la cantidad mínima');
            }
        }

        if (configData.porcentaje_util_incpa === undefined || configData.porcentaje_util_incpa === null) {
            errors.push('El porcentaje de utilidad es requerido para configuraciones por rango');
        } else if (configData.porcentaje_util_incpa < 0) {
            errors.push('El porcentaje de utilidad no puede ser negativo');
        }
    } else {
        if (configData.precio_fijo_incpa === undefined || configData.precio_fijo_incpa === null) {
            errors.push('El precio fijo es requerido para configuraciones sin rangos');
        } else if (configData.precio_fijo_incpa < 0) {
            errors.push('El precio fijo no puede ser negativo');
        }
    }


    if (!configData.rangos_incpa && configData.porcentaje_util_incpa !== undefined && configData.porcentaje_util_incpa !== null) {
        errors.push('No se puede especificar porcentaje de utilidad en una configuración de precio fijo');
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

