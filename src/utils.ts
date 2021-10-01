export interface Type<T = any> extends Function {
  new (...args: any[]): T;
}
export type AnyObject = Record<string | number | symbol, any>;

export type Required<T extends AnyObject, K extends keyof T = keyof T> = (Omit<T, K> & { [key in K]-?: T[key] });

export function isClass(ctor: Type | unknown): ctor is Type<unknown> {
  try {
    Reflect.construct(String, [], ctor as Type);
  } catch {
    return false;
  }
  return (ctor as Type) !== Object;
}
