import * as _ from 'lodash';

export interface Type<T = any> extends Function {
  new (...args: any[]): T;
}
export type AnyObject = Record<string | number | symbol, any>;

export type Required<T extends AnyObject, K extends keyof T = keyof T> = (Omit<T, K> & { [key in K]-?: T[key] });

// TODO: replace with _.isSymbol() after update typings in lodash
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const isSymbol: (value: unknown) => value is symbol = _.isSymbol as any;
