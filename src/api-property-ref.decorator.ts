import * as _ from 'lodash';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ApiPropertyOptions } from '@nestjs/swagger';
import { createApiPropertyDecorator } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import { getFromContainer, MetadataStorage } from 'class-validator';
import { ValidationMetadata } from 'class-validator/metadata/ValidationMetadata';

import { Type, isSymbol } from './utils';

export const apiDecoratorsSymbol = Symbol('api-decorators');
export const entityConstructorSymbol = Symbol('entity-constructor');

export interface ApiEntityRefType extends Type<unknown> {
  [apiDecoratorsSymbol]?: {
    swagger: (EntityConstructor: Type<unknown>) => void;
    validators: (
      EntityConstructor: Type<unknown>,
      realTarget: Type<any>,
      groups: string[],
    ) => void;
  }[];
  [entityConstructorSymbol]?: Type<unknown>;
}

const validatorsByConstructor = new Map<Type<any>,
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

  private readonly target: Function & { constructor: ApiEntityRefType };
  private readonly propertyKey: string;
  private readonly normalizedEntityPropertyKey: string;
  private readonly options: Readonly<ApiPropertyRefOptions>;

  private classValidatorStorage = (this.constructor as typeof ApiPropertyRefDecorator).classValidatorStorage;

  public constructor(
    target: object,
    propertyKey: string | symbol,
    private swaggerOptions: ApiPropertyOptions,
    options: ApiPropertyRefOptions,
  ) {
    this.target = target as Function & { constructor: ApiEntityRefType };

    if (isSymbol(propertyKey)) {
      const entityName = _.isFunction(target) && target.name ? target.name : undefined;
      const entityNameInfo = ` Entity: ${ entityName }`;
      throw new Error(`${ ApiPropertyRef.name } decorator is not applicable to 'symbol' properties.${ entityNameInfo }`);
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
      this.target.constructor[apiDecoratorsSymbol]
        = Object.prototype.hasOwnProperty.call(this.target.constructor, apiDecoratorsSymbol)
          ? (this.target.constructor[apiDecoratorsSymbol] || [])
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
    );
    if (existingEntityMetadata) {
      const targetMetadata = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, this.target, this.propertyKey);

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
      Reflect.defineMetadata(DECORATORS.API_MODEL_PROPERTIES, metadataToSave, this.target, this.propertyKey);


      const properties = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, this.target) || [];

      const key = `:${ this.propertyKey }`;
      if (!properties.includes(key)) {
        Reflect.defineMetadata(
          DECORATORS.API_MODEL_PROPERTIES_ARRAY,
          [...properties, `:${ this.propertyKey }`],
          this.target,
        );
      }
    } else if (!_.isEmpty(this.swaggerOptions)) {
      createApiPropertyDecorator(this.swaggerOptions)(this.target, this.propertyKey);
    }
  };

  private copyClassValidatorDecorators = (
    EntityConstructor: Type<unknown>,
    realTarget: Type<any>,
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
          .getTargetValidationMetadatas(EntityConstructor, undefined as any /* lib typings issue */, groups)
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
          validationOptions: {
            ...(validator.validationTypeOptions || {}),
            always: hasNoGroupsDiff ? undefined : validator.validationTypeOptions?.always ?? undefined,
            groups: hasNoGroupsDiff ? undefined : groupsDiff,
          },
        });
        this.classValidatorStorage.addValidationMetadata(updatedValidator);
      });
    }
  };
}

// TODO: Cover by unit tests
export function ApiPropertyRef(
  swaggerOptions: ApiPropertyOptions = {},
  options: ApiPropertyRefOptions = {},
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void =>
    new ApiPropertyRefDecorator(target, propertyKey, swaggerOptions, options).addMetadata();
}
