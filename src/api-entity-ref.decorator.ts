import * as _ from 'lodash';
import tb from 'ts-toolbelt';

import { Type } from './utils';

import { apiDecoratorsSymbol, entityConstructorSymbol, ApiEntityRefType } from './api-property-ref.decorator';

const hasApiDecorators = (
  value: unknown | ApiEntityRefType,
): value is tb.O.Required<ApiEntityRefType, typeof apiDecoratorsSymbol> =>
  _.isArray((value as ApiEntityRefType)[apiDecoratorsSymbol]);

export function ApiEntityRef<T extends object>(
  EntityConstructor: Type<T>,
  { groups = [] }: { groups?: string[] } = {},
): ClassDecorator {
  return (_target: Function): void => {
    const target  = _target as ApiEntityRefType;

    if (!_.isFunction(target)) {
      throw new Error(`${ ApiEntityRef.name } decorator is applicable only to classes`);
    }

    target[entityConstructorSymbol] = EntityConstructor;

    const PARENTS_LIMIT = 16;
    let i = 0;
    for (
      let targetOrItsParent = target;
      targetOrItsParent && i < PARENTS_LIMIT;
      i++, targetOrItsParent = Object.getPrototypeOf(targetOrItsParent)
    ) {
      if (!hasApiDecorators(targetOrItsParent)) continue; // eslint-disable-line no-continue

      targetOrItsParent[apiDecoratorsSymbol].forEach(({ swagger, validators }) => {
        swagger(EntityConstructor);
        validators(EntityConstructor, target, groups);
      });
    }
    if (i >= PARENTS_LIMIT) {
      // eslint-disable-next-line no-console
      console.warn(`Warning! ${ ApiEntityRef.name }: parents limit faced for ${ target.name }. It looks like a recursive prototype link`);
    }
  };
}
