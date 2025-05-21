import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';

@ValidatorConstraint({ name: 'uniqueArray', async: false })
export class UniqueArrayValidator implements ValidatorConstraintInterface {
  validate(value: any[], args: ValidationArguments) {
    // Si el valor es null/undefined o no es array, dejamos que otras validaciones lo manejen
    if (!Array.isArray(value) || value.length === 0) return true;
    
    const uniqueItems = new Set(value);
    return uniqueItems.size === value.length;
  }

  defaultMessage(args: ValidationArguments) {
    return 'El array contiene elementos duplicados';
  }
}


// Para arrays de objetos
@ValidatorConstraint({ name: 'UniqueArrayFieldValidator', async: false })
export class UniqueArrayFieldValidator implements ValidatorConstraintInterface {
  validate(value: any[], args: ValidationArguments) {
    // Si no es array o está vacío, pasa la validación (deja que @IsArray lo maneje)
    if (!Array.isArray(value) || value.length === 0) return true;

    const [fieldToCheck] = args.constraints; // Extrae el campo a validar (ej: 'telefono')
    const uniqueValues = new Set();

    for (const item of value) {
      const fieldValue = item[fieldToCheck];
      
      // Si el campo no existe o está vacío, ignoramos (deja que otras validaciones lo manejen)
      if (fieldValue === undefined || fieldValue === null) continue;

      if (uniqueValues.has(fieldValue)) {
        return false; // Duplicado encontrado
      }
      uniqueValues.add(fieldValue);
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const [fieldToCheck] = args.constraints;
    return `El campo '${fieldToCheck}' contiene valores duplicados en el array`;
  }
}

// Decorador personalizado para uso más limpio
export function UniqueArrayField(field: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'UniqueArrayField',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [field],
      validator: UniqueArrayFieldValidator,
    });
  };
}