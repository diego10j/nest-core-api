// is-before-or-equal-to.decorator.ts
import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
  } from 'class-validator';
  
  export function IsBeforeOrEqualTo(
    property: string,
    validationOptions?: ValidationOptions,
  ) {
    return (object: any, propertyName: string) => {
      registerDecorator({
        name: 'isBeforeOrEqualTo',
        target: object.constructor,
        propertyName: propertyName,
        options: validationOptions,
        constraints: [property],
        validator: {
          validate(value: any, args: ValidationArguments) {
            const [relatedPropertyName] = args.constraints;
            const relatedValue = (args.object as any)[relatedPropertyName];
            return (
              value === null ||
              value === undefined ||
              relatedValue === null ||
              relatedValue === undefined ||
              value <= relatedValue
            );
          },
          defaultMessage(args: ValidationArguments) {
            const [relatedPropertyName] = args.constraints;
            return `${
              args.property
            } must be less than or equal to ${relatedPropertyName}`;
          },
        },
      });
    };
  }
  

  export function IsAfterOrEqualTo(
    property: string,
    validationOptions?: ValidationOptions,
  ) {
    return (object: any, propertyName: string) => {
      registerDecorator({
        name: 'isAfterOrEqualTo',
        target: object.constructor,
        propertyName: propertyName,
        options: validationOptions,
        constraints: [property],
        validator: {
          validate(value: any, args: ValidationArguments) {
            const [relatedPropertyName] = args.constraints;
            const relatedValue = (args.object as any)[relatedPropertyName];
            return (
              value === null ||
              value === undefined ||
              relatedValue === null ||
              relatedValue === undefined ||
              value >= relatedValue
            );
          },
          defaultMessage(args: ValidationArguments) {
            const [relatedPropertyName] = args.constraints;
            return `${
              args.property
            } must be greater than or equal to ${relatedPropertyName}`;
          },
        },
      });
    };
  }