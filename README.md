# Z-Brain Api Entity Ref

<p>
  <a target="_blank" href="https://github.com/z-brain/api-entity-ref/actions?query=workflow%3A%22Build%22">
    <img alt="Build status" src="https://github.com/z-brain/api-entity-ref/workflows/Build/badge.svg">
  </a>
  <a target="_blank" href="https://www.npmjs.com/package/@z-brain/api-entity-ref">
    <img alt="NPM version" src="https://img.shields.io/npm/v/@z-brain/api-entity-ref.svg">
  </a>
  <a target="_blank" href="https://www.gnu.org/licenses/gpl-3.0">
    <img alt="License: GPL v3" src="https://img.shields.io/badge/License-GPLv3-blue.svg">
  </a>
</p>

Decorators to copy swagger & class-validator metadata from one class to another

*Notice: If you have any propositions feel free to make an issue or create a pull request.*

## How to use

### Installing

`yarn add @z-brain/api-entity-ref`  
or  
`npm i -s @z-brain/api-entity-ref`

### Usage example

`dtos/account-base.dto.ts`
```typescript
import { ApiPropertyRef } from '@z-brain/api-entity-ref';
import { Account } from '../types';

export abstract class AccountBaseDto implements Omit<Account, 'id'> {

  @ApiPropertyRef()
  public email!: string;

  @ApiPropertyRef()
  public firstName?: string;

}
```

`dtos/account-create.dto.ts`
```typescript
import { ApiEntityRef, ApiPropertyRef } from '@z-brain/api-entity-ref';
import { EEntityValidationGroup } from '@lib/common/enums';
import { Account } from '../types';
import { AccountBaseDto } from './account-base.dto';

@ApiEntityRef(Account, { groups: [EEntityValidationGroup.Create] })
export class AccountCreateDto extends AccountBaseDto {

  @ApiPropertyRef()
  public lastName?: string;

}
```

`dtos/account-update.dto.ts`
```typescript
import { Allow, IsNotEmpty } from 'class-validator';
import { ApiEntityRef } from '@z-brain/api-entity-ref';

import { IDInt } from '@lib/common/types';
import { EEntityValidationGroup } from '@lib/common/enums';

import { Account } from '../types';
import { AccountBaseDto } from './account-base.dto';

@ApiEntityRef(Account, { groups: [EEntityValidationGroup.Update] })
export class AccountUpdateDto extends AccountBaseDto implements Omit<Account, 'fullName'> {

  @Allow()
  @IsNotEmpty()
  public id!: IDInt;

}
```

`types/account.entity.ts`
```typescript
import { ApiProperty, ApiPropertyOptional, ApiResponseProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

import { IDInt } from '@lib/common/types';
import {
  DEFAULT_EMAIL_MAX_LEN,
  DEFAULT_EMAIL_MIN_LEN,
  DEFAULT_NAME_MAX_LEN,
  DEFAULT_NAME_MIN_LEN,
} from '@lib/common/db.constants';
import { IsUnique } from '@lib/common/validators';
import { EEntityValidationGroup } from '@lib/common/enums';

@Entity()
export class Account {
  public static readonly NAMELESS_FULL_NAME: string = 'Nameless User';

  @ApiResponseProperty({ example: 1234 })
  @PrimaryGeneratedColumn('increment', { unsigned: true })
  public id!: IDInt;

  @ApiProperty({
    example: 'ivan@gmail.com',
    maxLength: DEFAULT_NAME_MAX_LEN,
    minLength: DEFAULT_NAME_MIN_LEN,
    uniqueItems: true,
  })
  @Column({ length: DEFAULT_EMAIL_MAX_LEN, unique: true })
  @IsOptional({ groups: [EEntityValidationGroup.Update] })
  @IsEmail(undefined, { always: true })
  @IsUnique(Account, undefined, { always: true })
  @Length(DEFAULT_EMAIL_MIN_LEN, DEFAULT_EMAIL_MAX_LEN, { always: true })
  public email!: string;

  @ApiPropertyOptional({
    example: 'Ivan',
    maxLength: DEFAULT_NAME_MAX_LEN,
    minLength: DEFAULT_NAME_MIN_LEN,
  })
  @IsOptional({ always: true })
  @IsString({ always: true })
  @Length(DEFAULT_NAME_MIN_LEN, DEFAULT_NAME_MAX_LEN, { always: true })
  @Column({ length: DEFAULT_NAME_MAX_LEN, nullable: true })
  public firstName?: string;

  @ApiPropertyOptional({
    example: 'Trump',
    maxLength: DEFAULT_NAME_MAX_LEN,
    minLength: DEFAULT_NAME_MIN_LEN,
  })
  @IsOptional({ always: true })
  @IsString({ always: true })
  @Length(DEFAULT_NAME_MIN_LEN, DEFAULT_NAME_MAX_LEN, { always: true })
  @Column({ length: DEFAULT_NAME_MAX_LEN, nullable: true })
  public lastName?: string;

  @ApiResponseProperty({
    example: 'Ivan Trump',
  })
  public get fullName(): string {
    return this.firstName && this.lastName
           ? `${ this.firstName } ${ this.lastName }`
           : this.firstName || this.lastName || (this.constructor as typeof Account).NAMELESS_FULL_NAME;
  }

}
```

## Development notes

### Quick Start

```bash
cd /code/z-brain
git clone git@github.com:z-brain/api-entity-ref.git
cd api-entity-ref
yarn install
```

### How to use NodeJS version from the `.nvmrc`

1. Install NVM
2. Use `.nvmrc` file one of the next ways:

    * Execute `nvm use` in the project root directory
    * Install [NVM Loader](https://github.com/korniychuk/ankor-shell) and your .nvmrc will be loaded automatically when you open the terminal.
      ![NVM Loader demo](./resources/readme.nvm-loader.png)

### How to make a build

`npm run build`

### How to run lint

* Just show problems `npm run lint`
* Fix problems if it is possible `npm run lint:fix`

### How to run tests

* All tests

  `npm run test`  
  `npm run test:watch`
* Specific tests

  `npm run test -- src/my.spec.ts`  
  `npm run test:watch -- src/my.spec.ts`

### How to build and publish NPM package

*NPM Token:* `npm_ggEB......6ZRs`

CI configuration details here: [.github/workflows/npmpublish.yml](.github/workflows/npmpublish.yml)

```bash
npm run pre-push \
&& npm version patch -m 'Update package version version to %s' \
&& npm run gen-public-package.json \
&& cp README.md dist/ \
&& npm publish dist --access public \
&& git push --no-verify && git push --tags --no-verify
```

### How to build package to local installation

1. `yarn run build:local`
2. Then you can install a local package build from path `file:.../api-entity-ref/dist`.

## Author

| [<img src="https://www.korniychuk.pro/avatar.jpg" width="100px;"/><br /><sub>Anton Korniychuk</sub>](https://korniychuk.pro) |
| :---: |
