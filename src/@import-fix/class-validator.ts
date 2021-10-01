/* eslint-disable no-restricted-imports,@typescript-eslint/ban-ts-comment */

import { ValidationMetadata as ValidationMetadataType } from 'class-validator/types/metadata/ValidationMetadata';
// @ts-ignore
import { ValidationMetadata as ValidationMetadataCtor } from 'class-validator/cjs/metadata/ValidationMetadata';

export * from 'class-validator';

export const ValidationMetadata = ValidationMetadataCtor as typeof ValidationMetadataType;
export type ValidationMetadata = ValidationMetadataType;
