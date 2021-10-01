import * as _ from 'lodash';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ApiPropertyOptions } from '@nestjs/swagger';
import { createApiPropertyDecorator } from '@nestjs/swagger/dist/decorators/api-property.decorator';

import { ValidationMetadata, getFromContainer, MetadataStorage } from './@import-fix/class-validator';
import { AnyObject, isClass, Type } from './utils';

export const apiDecoratorsSymbol = Symbol('api-decorators');
export const entityConstructorSymbol = Symbol('entity-constructor');

export interface ApiEntityRefType extends Type<unknown> {
  [apiDecoratorsSymbol]?: {
    swagger: (EntityConstructor: Type<unknown>) => void;
    validators: (
      EntityConstructor: Type<unknown>,
      realTarget: Type,
      groups: string[],
    ) => void;
  }[];
  [entityConstructorSymbol]?: Type<unknown>;
}

const validatorsByConstructor = new Map<Type,
  {
    /* groupsHashKey is a sorted, concatenated by "," groups array */
    [groupsHasKey: string]: Map<string | symbol, ValidationMetadata[]>;
  }>();

export interface ApiPropertyRefOptions {
  entityPropertyKey?: string;
  overrideExisting?: boolean;
}

export class ApiPropertyRefDecorator {

  private static readonly classValidatorStorage = getFromContainer(MetadataStorage);

  private readonly classProto: { constructor: ApiEntityRefType };
  private readonly propertyKey: string;
  private readonly normalizedEntityPropertyKey: string;
  private readonly options: Readonly<ApiPropertyRefOptions>;

  private classValidatorStorage = (this.constructor as typeof ApiPropertyRefDecorator).classValidatorStorage;

  public constructor(
    classProto: AnyObject,
    propertyKey: string | symbol,
    private swaggerOptions: ApiPropertyOptions,
    options: ApiPropertyRefOptions,
  ) {
    const apiPropertyRefClassName = ApiPropertyRef.name; // eslint-disable-line no-use-before-define
    if (!isClass(classProto.constructor)) {
      throw new Error(`${ apiPropertyRefClassName } decorator is applicable only to class properties`);
    }
    this.classProto = classProto as { constructor: ApiEntityRefType };

    if (_.isSymbol(propertyKey)) {
      const entityNameInfo = ` Entity: ${ String(this.classProto.constructor.name) }`;
      throw new Error(`${ apiPropertyRefClassName } decorator is not applicable to 'symbol' properties.${ entityNameInfo }`);
    }
    this.propertyKey =  propertyKey;

    this.normalizedEntityPropertyKey = options.entityPropertyKey || propertyKey;

    this.options = {
      overrideExisting: true,
      ...options,
    };
  }

  public addMetadata(): void {
    (
      this.classProto.constructor[apiDecoratorsSymbol]
        = Object.prototype.hasOwnProperty.call(this.classProto.constructor, apiDecoratorsSymbol)
          ? (this.classProto.constructor[apiDecoratorsSymbol] || [])
          : []
    ).push({
      swagger: this.copySwaggerDecorators,
      validators: this.copyClassValidatorDecorators,
    });
  }

  private copySwaggerDecorators = (EntityConstructor: Type<unknown>): void => {
    const existingEntityMetadata = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      EntityConstructor.prototype,
      this.normalizedEntityPropertyKey,
    ) as AnyObject;
    if (existingEntityMetadata) {
      const targetMetadata
              = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, this.classProto, this.propertyKey) as AnyObject;

      const existingMetadata = targetMetadata || existingEntityMetadata;
      const newMetadata = _.pickBy(this.swaggerOptions, _.negate(_.isUndefined));

      const metadataToSave = this.options.overrideExisting
                             ? {
                               ...existingMetadata,
                               ...newMetadata,
                             }
                             : {
                               ...newMetadata,
                               ...existingMetadata,
                             };
      Reflect.defineMetadata(DECORATORS.API_MODEL_PROPERTIES, metadataToSave, this.classProto, this.propertyKey);

      const properties = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, this.classProto) as string[] || [];

      const key = `:${ this.propertyKey }`;
      if (!properties.includes(key)) {
        Reflect.defineMetadata(
          DECORATORS.API_MODEL_PROPERTIES_ARRAY,
          [...properties, `:${ this.propertyKey }`],
          this.classProto,
        );
      }
    } else if (!_.isEmpty(this.swaggerOptions)) {
      createApiPropertyDecorator(this.swaggerOptions)(this.classProto, this.propertyKey);
    }
  };

  private copyClassValidatorDecorators = (
    EntityConstructor: Type<unknown>,
    realTarget: Type,
    groups: string[] = [],
  ): void => {
    const groupsHashKey = [...groups].sort().join();

    let validationGroups = validatorsByConstructor.get(EntityConstructor);
    if (!validationGroups) {
      validationGroups = {};
      validatorsByConstructor.set(EntityConstructor, validationGroups);
    }

    let validators = validationGroups?.[groupsHashKey];
    if (!validators) {
      validators = new Map<string, ValidationMetadata[]>();

      this.classValidatorStorage
          .getTargetValidationMetadatas(
            EntityConstructor,
            undefined as any /* lib typings issue */,
            undefined as any /* lib typings issue */, // TODO: Implement global .always here
            undefined as any /* lib typings issue */,
            groups,
          )
          .forEach((validator) => {
            let propValidators = validators?.get(validator.propertyName);
            if (!propValidators) {
              propValidators = [];
              validators?.set(validator.propertyName, propValidators);
            }
            propValidators.push(validator);
          });

      validationGroups[groupsHashKey] = validators;
    }

    const targetValidators = validators.get(this.normalizedEntityPropertyKey);
    if (targetValidators) {
      targetValidators.forEach((validator) => {
        const groupsDiff = _.difference(validator.groups, groups);
        const hasNoGroupsDiff = _.isEmpty(groupsDiff);

        const updatedValidator = new ValidationMetadata({
          ...validator,
          propertyName: this.propertyKey,
          target: realTarget,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          validationOptions: {
            ...(validator.validationTypeOptions || {}),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
            always: hasNoGroupsDiff ? true      : validator.validationTypeOptions?.always ?? undefined,
            groups: hasNoGroupsDiff ? undefined : groupsDiff,
          },
        });
        this.classValidatorStorage.addValidationMetadata(updatedValidator);
      });
    }
  };
}

export function ApiPropertyRef(
  swaggerOptions: ApiPropertyOptions = {},
  options: ApiPropertyRefOptions = {},
): PropertyDecorator {
  return (target: AnyObject, propertyKey: string | symbol): void =>
    new ApiPropertyRefDecorator(target, propertyKey, swaggerOptions, options).addMetadata();
}
