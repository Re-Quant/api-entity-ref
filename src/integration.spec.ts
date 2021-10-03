import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { plainToClass, Type } from 'class-transformer';
import { IsInt, IsString, Max, Min, validate } from 'class-validator';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
    });
  }); // END: Testing copying nestjs/swagger decorators

  describe('Testing copying class-transformer decorators', () => {
    describe('GIVEN: Two classes: User & UserCreateDto. Last one with Api*Ref decorators', () => {
      describe('@Type() decorator', () => {
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
    });
  });
});
