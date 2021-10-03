import * as _ from 'lodash';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ApiPropertyOptions } from '@nestjs/swagger';
import { createApiPropertyDecorator } from '@nestjs/swagger/dist/decorators/api-property.decorator';

import {
  defaultMetadataStorage,
  ExcludeMetadata,
  ExposeMetadata,
  TransformationType,
  TransformMetadata,
  TypeMetadata,
} from './@import-fix/class-transformer';
import { getMetadataStorage, ValidationMetadata } from './@import-fix/class-validator';
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
    forClassTransformations: (EntityConstructor: Type<unknown>) => void;
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

  private static readonly classValidatorStorage = getMetadataStorage();

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
      forClassTransformations: this.copyClassTransformerDecorators.bind(this),
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
  }; // END copySwaggerDecorators()

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
  }; // END copyClassValidatorDecorators()

  private copyClassTransformerDecorators(EntityConstructor: Type<unknown>): void {
    const storage = defaultMetadataStorage;

    const type = storage.findTypeMetadata(EntityConstructor, this.normalizedEntityPropertyKey);
    if (type) {
      const copy: TypeMetadata = { ...type, target: this.classProto.constructor, propertyName: this.propertyKey };
      storage.addTypeMetadata(copy);
    }

    const expose = storage.findExposeMetadata(EntityConstructor, this.normalizedEntityPropertyKey);
    if (expose) {
      const copy: ExposeMetadata = { ...expose, target: this.classProto.constructor, propertyName: this.propertyKey };
      storage.addExposeMetadata(copy);
    }
    const exposeOnClass = storage.findExposeMetadata(EntityConstructor, undefined as any /* typing issue */);
    if (exposeOnClass) {
      const copy: ExposeMetadata = { ...exposeOnClass, target: this.classProto.constructor, propertyName: undefined };
      storage.addExposeMetadata(copy);
    }

    const exclude = storage.findExcludeMetadata(EntityConstructor, this.normalizedEntityPropertyKey);
    if (exclude) {
      const copy: ExcludeMetadata = { ...exclude, target: this.classProto.constructor, propertyName: this.propertyKey };
      storage.addExcludeMetadata(copy);
    }
    const excludeOnClass = storage.findExcludeMetadata(EntityConstructor, undefined as any /* typing issue */);
    if (excludeOnClass) {
      const copy: ExcludeMetadata = { ...excludeOnClass, target: this.classProto.constructor, propertyName: undefined };
      storage.addExcludeMetadata(copy);
    }

    const transformMetadataCopyCb = (meta: TransformMetadata) => {
      const copy: TransformMetadata = { ...meta, target: this.classProto.constructor, propertyName: this.propertyKey };
      storage.addTransformMetadata(copy);
    };
    // Notice: CLASS_TO_CLASS transformers is not tested, but should work.
    // I don't understand what they do and how to use them. So I don't know how to test them and don't.
    _.values(TransformationType).forEach(transformationTypeValue =>
      storage.findTransformMetadatas(
        EntityConstructor,
        this.normalizedEntityPropertyKey,
        transformationTypeValue as TransformationType,
      ).forEach(transformMetadataCopyCb),
    );
  }

}

export function ApiPropertyRef(
  swaggerOptions: ApiPropertyOptions = {},
  options: ApiPropertyRefOptions = {},
): PropertyDecorator {
  return (target: AnyObject, propertyKey: string | symbol): void =>
    new ApiPropertyRefDecorator(target, propertyKey, swaggerOptions, options).addMetadata();
}
