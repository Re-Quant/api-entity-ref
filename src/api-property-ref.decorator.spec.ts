import { ApiPropertyRef, ApiPropertyRefDecorator } from './api-property-ref.decorator';

describe(`${ ApiPropertyRefDecorator.name }`, () => {
  describe('Instantiating', () => {
    it(`WHEN: An attempt to instantiate with not a custom class prototype target
        THEN: Should throw an error.`, () => {
      const cb = () => {
        // eslint-disable-next-line no-new
        new ApiPropertyRefDecorator({}, '', {}, {});
      };

      expect(cb).toThrowError(/decorator is applicable only to class properties/);
    });
    it(`WHEN: An attempt to instantiate with a custom class prototype target
        THEN: Should throw an error.`, () => {
      class User {}
      const cb = () => {
        // eslint-disable-next-line no-new
        new ApiPropertyRefDecorator(User.prototype, '', {}, {});
      };

      expect(cb).not.toThrowError();
    });

    it(`WHEN: The decorator is added to a symbol property
        THEN: Should throw an error about inapplicability ${ ApiPropertyRef.name } to symbol properties`, () => {
      const cb = () => {
        const symbolFieldKey = Symbol('a test');
        class User { // eslint-disable-line @typescript-eslint/no-unused-vars
          @ApiPropertyRef()
          public [symbolFieldKey]!: string;
        }
      };
      expect(cb).toThrowError(/decorator is not applicable to 'symbol' properties/);
    });
    it(`WHEN: The decorator is added to a non-symbol property
        THEN: Shouldn't throw any errors`, () => {
      const cb = () => {
        class User { // eslint-disable-line @typescript-eslint/no-unused-vars
          @ApiPropertyRef()
          public nonSymbolProperty!: string;
        }
      };
      expect(cb).not.toThrowError();
    });
  });
});
