/* eslint-disable no-restricted-imports,@typescript-eslint/ban-ts-comment */

import { defaultMetadataStorage as defaultMetadataStorageType } from 'class-transformer/types/storage';
// @ts-ignore
import { defaultMetadataStorage as defaultMetadataStorageIns } from 'class-transformer/cjs/storage';

export * from 'class-transformer';
export const defaultMetadataStorage = defaultMetadataStorageIns as typeof defaultMetadataStorageType;
export type defaultMetadataStorage = typeof defaultMetadataStorageType;
