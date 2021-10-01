export interface Type<T = any> extends Function {
  new (...args: any[]): T;
}
export type AnyObject = Record<string | number | symbol, any>;

export type Required<T extends AnyObject, K extends keyof T = keyof T> = (Omit<T, K> & { [key in K]-?: T[key] });
