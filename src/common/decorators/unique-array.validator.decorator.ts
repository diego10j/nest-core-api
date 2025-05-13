import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

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