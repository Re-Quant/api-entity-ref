import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { classToPlain, Exclude, Expose, plainToClass, Transform, Type } from 'class-transformer';
import { IsInt, IsString, Max, Min, validate } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ReferenceObject, SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

import { ApiEntityRef, ApiPropertyRef } from './public-api';
import { Type as ClassType } from './utils';

describe('Integration tests', () => {
  describe('Test copying class-validator decorators', () => {
    describe('GIVEN: Two classes: User & UserCreateDto. Last one with Api*Ref decorators', () => {
      it(`Testing basic usage, just copying validators. 
          WHEN: Validators on the User class doesn't have any groups and .always modifiers
           AND: UserCreateDto doesn't have any groups
          THEN: All validation rules should be copy-pasted as is`, async () => {
        // arrange
        class User {
          @IsInt()
          public id!: number;

          @IsString()
          public name!: string;
        }

        @ApiEntityRef(User)
        class UserCreateDto {
          @ApiPropertyRef()
          public id!: number;

          @ApiPropertyRef()
          public name!: string;
        }
        const ins = new UserCreateDto();

        // act
        const errors = await validate(ins);

        // assert
        expect(errors.find(v => v.property === 'id')!.constraints).toEqual({ isInt: 'id must be an integer number' });
        expect(errors.find(v => v.property === 'name')!.constraints).toEqual({ isString: 'name must be a string' });
      });

      it(`Testing groups handling.
          WHEN: User validation rules has two groups & one of them is passed to ${ ApiEntityRef.name }
          THEN: Only validators with this group and { always: true } should be copy-pasted`, async () => {
        // arrange
        class User {
          @Min(5, { groups: ['a'] })
          @Max(10, { groups: ['b'] })
          public id!: number; // select by group 'a', when there is only one group on the validator

          @Min(18, { groups: ['a', 'b'] })
          public age!: number; // select by group 'a', when there are multiple groups on the validator

          @Max(4, { groups: ['b'], always: true })
          public legs!: number; // select because of { always: true }, in spite of group 'b'

          @IsString()
          public name!: string; // shouldn't be copied because doesn't have a group or { always: true }

          @IsString({ always: true })
          public email!: string; // select because of { always: true }
        }

        @ApiEntityRef(User, { groups: ['a'] })
        class UserCreateDto {
          @ApiPropertyRef()
          public id!: number;

          @ApiPropertyRef()
          public age!: number;

          @ApiPropertyRef()
          public legs!: number;

          @ApiPropertyRef()
          public name!: string;

          @ApiPropertyRef()
          public email!: string;
        }
        const ins = new UserCreateDto();

        // act
        const errors = await validate(ins);

        // assert
        expect(errors.find(v => v.property === 'id')!.constraints).toEqual({ min: 'id must not be less than 5' });
        expect(errors.find(v => v.property === 'age')!.constraints).toEqual({ min: 'age must not be less than 18' });
        expect(errors.find(v => v.property === 'legs')!.constraints).toEqual({ max: 'legs must not be greater than 4' });
        expect(errors.find(v => v.property === 'name')).toBeUndefined(); // because of no group
        expect(errors.find(v => v.property === 'email')!.constraints).toEqual({ isString: 'email must be a string' });
      });

      it(`Testing DTOs & Entities inheritance.
          WHEN: User extends BaseUser, both have fields with validators.
           AND: abstract UserBaseDto contains fields that should be copied to both DTOs.
           AND: UserCreateDto extends UserBaseDto
          THEN: Validators from all parent DTOs should be merged`, async () => {
        // arrange
        abstract class BaseUser {
          @IsInt()
          public id!: number;
        }
        class User extends BaseUser {
          @IsString()
          public name!: string;
        }

        abstract class UserBaseDto {
          @ApiPropertyRef()
          public id!: number;
        }
        @ApiEntityRef(User)
        class UserCreateDto extends UserBaseDto {
          @ApiPropertyRef()
          public name!: string;
        }

        const ins = new UserCreateDto();

        // act
        const errors = await validate(ins);

        // assert
        expect(errors.find(v => v.property === 'id')!.constraints).toEqual({ isInt: 'id must be an integer number' });
        expect(errors.find(v => v.property === 'name')!.constraints).toEqual({ isString: 'name must be a string' });
      });
    });
  }); // END Test copying class-validator decorators

  describe('Testing copying nestjs/swagger decorators', () => {
    describe('GIVEN: Two classes: User & UserCreateDto. Last one with Api*Ref decorators', () => {
      const createApp = async (...controllers: ClassType[]) => {
        @Module({ controllers })
        class AppModule {}
        const fixture = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();
        const app = fixture.createNestApplication();
        return app;
      };
      const buildDocSchemas = (app: INestApplication) => {
        const options = new DocumentBuilder().build();
        const document = SwaggerModule.createDocument(app, options);
        return document.components!.schemas!;
      };
      /** dereference helper */
      const d = (data?: SchemaObject | ReferenceObject): SchemaObject | undefined => {
        if (!data) return data;
        if ((data as ReferenceObject).$ref) {
          throw new Error(`Can't test ReferenceObject: ${ JSON.stringify(data) }`);
        }
        return data as SchemaObject;
      };

      it(`Testing simple case. Just copying swagger decorators & patching options.
        WHEN: There some fields on User class decorated with @ApiProperty()
        THEN: All swagger decorators should be copy-pasted to the DTO`, async () => {
        // arrange
        class User {
          @ApiProperty({ minimum: 1 })
          public id!: number;

          @ApiProperty()
          public name!: string;
        }

        @ApiEntityRef(User)
        class UserCreateDto {
          @ApiPropertyRef()
          public id!: number;

          @ApiPropertyRef({ required: false })
          public name?: string;
        }
        @Controller()
        class UserController {
          // eslint-disable-next-line @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars
          @Post() public create(@Body() body: UserCreateDto): void {}
        }
        const app = await createApp(UserController);

        // act
        const schemas = buildDocSchemas(app);

        // assert
        expect(d(d(schemas.UserCreateDto)?.properties?.id)).toEqual({ type: 'number', minimum: 1 });
        expect(d(d(schemas.UserCreateDto)?.properties?.name)).toEqual({ type: 'string' });
        expect(d(schemas.UserCreateDto)?.required).toEqual(['id']);
      });

      it.only(`Two DTOs extended from the same Base DTO class.
          WHEN: UserCreateDto extends BaseDto
           AND: UserUpdateDto extends BaseDto
           AND: All 3 DTO classes has fields decorated with @${ ApiPropertyRef.name }()
          THEN: Both UserCreateDto & UserUpdateDto should have copied decorators.`, async () => {
        // arrange
        class User {
          @ApiProperty()
          public email!: string;

          @ApiPropertyOptional()
          public name?: string;
        }
        abstract class UserBaseDto {
          @ApiPropertyRef()
          public name?: string;
        }
        @ApiEntityRef(User)
        class UserCreateDto extends UserBaseDto {
          @ApiPropertyRef()
          public email!: string;
        }
        @ApiEntityRef(User)
        class UserUpdateDto extends UserBaseDto {
          @ApiPropertyRef({ required: false })
          public email?: string;
        }
        @Controller()
        class UserController {
          // eslint-disable-next-line @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars
          @Post() public create(@Body() body: UserCreateDto): void {}
          // eslint-disable-next-line @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars
          @Post() public update(@Body() body: UserUpdateDto /* ? */): void {}
        }
        const app = await createApp(UserController);

        // act
        const schemas = buildDocSchemas(app);

        // assert
        expect(d(d(schemas.UserCreateDto)?.properties?.email)).toEqual({ type: 'string' });
        expect(d(d(schemas.UserCreateDto)?.properties?.name)).toEqual({ type: 'string' });
        expect(d(schemas.UserCreateDto)?.required).toEqual(['email']);

        expect(d(d(schemas.UserUpdateDto)?.properties?.email)).toEqual({ type: 'string' });
        expect(d(d(schemas.UserUpdateDto)?.properties?.name)).toEqual({ type: 'string' });
        expect(d(schemas.UserUpdateDto)?.required).toBeUndefined();
      });
    });
  }); // END: Testing copying nestjs/swagger decorators

  describe('Testing copying class-transformer decorators', () => {
    describe('GIVEN: Two classes: User & UserCreateDto. Last one with Api*Ref decorators', () => {
      describe(`@${ Type.name }() decorator`, () => {
        it(`Testing basic usage, just copying @Type() decorator.
            WHEN: User.name is FirstLastName class and decorated with @Type() decorator
            THEN: The decorator should be copied to UserCreateDto`, () => {
          // arrange
          class FirstLastName {
            public first!: string;
            public last!: string;
          }
          class User {
            @Type()
            public name!: FirstLastName;
          }
          @ApiEntityRef(User)
          class UserCreateDto {
            @ApiPropertyRef()
            public name!: FirstLastName;
          }
          const raw = {
            name: { first: 'aaa', last: 'bbb' },
          };

          // act
          const ins = plainToClass(UserCreateDto, raw);

          // assert
          expect(ins).toEqual(raw);
          expect(ins.name).toBeInstanceOf(FirstLastName);
        });
      }); // END @Type() decorator

      describe(`@${ Expose.name }() decorator`, () => {
        it('Basic usage, just copying @Expose() decorator from a property-level an Entity to a DTO.', () => {
          // arrange
          class User {
            @Expose()
            public name!: string;

            public password!: string;
          }
          @ApiEntityRef(User)
          class UserCreateDto {
            @ApiPropertyRef()
            public name!: string;

            @ApiPropertyRef()
            public password!: string;
          }
          const ins = new UserCreateDto();
          ins.name = 'aaa';
          ins.password = 'bbb';

          // act
          const raw = classToPlain(ins, { strategy: 'excludeAll' });

          // assert
          expect(raw).toEqual({ name: ins.name });
        });
      }); // END @Expose() decorator

      describe(`@${ Exclude.name }() decorator`, () => {
        it('Basic usage, just copying @Exclude() decorator from a property-level an Entity to a DTO.', () => {
          // arrange
          class User {
            public name!: string;

            @Exclude()
            public password!: string;
          }
          @ApiEntityRef(User)
          class UserCreateDto {
            @ApiPropertyRef()
            public name!: string;

            @ApiPropertyRef()
            public password!: string;
          }
          const ins = new UserCreateDto();
          ins.name = 'aaa';
          ins.password = 'bbb';

          // act
          const raw = classToPlain(ins, { strategy: 'exposeAll' });

          // assert
          expect(raw).toEqual({ name: ins.name });
        });
      }); // END @Exclude() decorator

      describe(`@${ Expose.name }() & @${ Exclude.name } () together`, () => {
        it(`Testing class-level usage of @${ Expose.name }().
            WHEN: @${ Expose.name }() decorator is added to the User class at the class level.
             AND: @${ Exclude.name }() decorator is added to the .password field
             AND: strategy is 'excludeAll'
            THEN: class-level & property-level decorators should be copied`, () => {
          // arrange
          @Expose()
          class User {
            public name!: string;

            @Exclude()
            public password!: string;
          }
          @ApiEntityRef(User)
          class UserCreateDto {
            @ApiPropertyRef()
            public name!: string;

            @ApiPropertyRef()
            public password!: string;
          }
          const ins = new UserCreateDto();
          ins.name = 'aaa';
          ins.password = 'bbb';

          // act
          const raw = classToPlain(ins, { strategy: 'excludeAll' });

          // assert
          expect(raw).toEqual({ name: ins.name });
        });

        it(`Testing class-level usage of @${ Exclude.name }().
            WHEN: @${ Exclude.name }() decorator is added to the User class at the class level.
             AND: @${ Expose.name }() decorator is added to the .name field
             AND: strategy is 'exposeAll'
            THEN: class-level & property-level decorators should be copied`, () => {
          // arrange
          @Exclude()
          class User {
            @Expose()
            public name!: string;

            public password!: string;
          }
          @ApiEntityRef(User)
          class UserCreateDto {
            @ApiPropertyRef()
            public name!: string;

            @ApiPropertyRef()
            public password!: string;
          }
          const ins = new UserCreateDto();
          ins.name = 'aaa';
          ins.password = 'bbb';

          // act
          const raw = classToPlain(ins, { strategy: 'exposeAll' });

          // assert
          expect(raw).toEqual({ name: ins.name });
        });
      }); // END @Expose() & @Exclude() together

      describe(`@${ Transform.name }() decorators`, () => {
        describe('Copying @Transform() decorators from an Entity to a DTO.', () => {
          it('Should copy PLAIN_TO_CLASS decorators', () => {
            // arrange
            const date = new Date();
            class User {
              @Transform(({ value }) => new Date(value))
              public createdAt!: Date;
            }
            @ApiEntityRef(User)
            class UserCreateDto {
              @ApiPropertyRef()
              public createdAt!: Date;
            }
            const raw = { createdAt: date.toISOString() };

            // act
            const ins = plainToClass(UserCreateDto, raw);

            // assert
            expect(ins.createdAt).toBeInstanceOf(Date);
            expect(ins.createdAt.toISOString()).toEqual(date.toISOString());
          });

          it('Should copy CLASS_TO_PLAIN decorators', () => {
            // arrange
            const date = new Date();
            class User {
              @Transform(({ value }) => (value as Date).toISOString(), { toPlainOnly: true })
              public createdAt!: Date;
            }
            @ApiEntityRef(User)
            class UserCreateDto {
              @ApiPropertyRef()
              public createdAt!: Date;
            }
            const ins = new UserCreateDto();
            ins.createdAt = date;

            // act
            const raw = classToPlain(ins);

            // assert
            expect(raw).toEqual({ createdAt: date.toISOString() });
          });
        });
      }); // END @${ Transform.name }() decorators
    }); // END GIVEN: Two classes: User & UserCreateDto. Last one with Api*Ref decorators

    describe('SCENARIO: Inheritance testing', () => {
      it(`DTOs inheritance testing.
          WHEN: User, UserCreateDto extends UserBaseDto.
           AND: User has Type & Exclude decorators of fields.
           AND: UserCreateDto has one field with @${ ApiPropertyRef.name }(), UserBaseDto another similar.
          THEN: All decorators from User have to be copied to UserCreateDto`, () => {
        // arrange
        class Name {
          public first!: string;
        }
        class User {
          public id!: number;

          @Type(() => Name)
          public name!: Name;

          @Exclude()
          public password!: string;
        }
        abstract class UserBaseDto {
          @ApiPropertyRef()
          public id!: number;

          @ApiPropertyRef()
          public password!: string;
        }
        @ApiEntityRef(User)
        class UserCreateDto extends UserBaseDto {
          @ApiPropertyRef()
          public name!: Name;
        }
        const raw = { id: 1, name: { first: 'aaa' }, password: 'bbb' };
        const insExpected = { id: 1, name: { first: 'aaa' } };

        // act
        const ins = plainToClass(UserCreateDto, raw);
        // assert
        expect(ins).toEqual(insExpected);
        expect(ins.name).toBeInstanceOf(Name);
      });

      it(`Entity inheritance.
          WHEN: User extends UserBase, both have class-transformer decorators on some fields
          THEN: DTO should have merged decorators from User & UserBase`, () => {
        // arrange
        class Name {
          public first!: string;
        }
        abstract class BaseUser {
          @Type(() => Name)
          public name!: Name;
        }
        class User extends BaseUser {
          public id!: number;

          @Exclude()
          public password!: string;
        }
        @ApiEntityRef(User)
        class UserCreateDto {
          @ApiPropertyRef()
          public id!: number;

          @ApiPropertyRef()
          public name!: Name;

          @ApiPropertyRef()
          public password!: string;
        }
        const raw = { id: 1, name: { first: 'aaa' }, password: 'bbb' };
        const insExpected = { id: 1, name: { first: 'aaa' } };

        // act
        const ins = plainToClass(UserCreateDto, raw);
        // assert
        expect(ins).toEqual(insExpected);
        expect(ins.name).toBeInstanceOf(Name);
      });
    }); // END SCENARIO Inheritance testing
  }); // END Testing copying class-transformer decorators
});
