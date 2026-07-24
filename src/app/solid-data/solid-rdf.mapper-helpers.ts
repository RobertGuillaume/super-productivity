import type {
  RdfLiteralValue,
  RdfValue,
  Thing,
  ThingRdfPropertyValue,
} from '@solid-intents/runtime';
import { RDF_JSON_DATATYPE } from './solid-productivity-vocab';

export type SolidRdfPropertyMap = Record<string, readonly ThingRdfPropertyValue[]>;

export const addLiteral = (
  properties: SolidRdfPropertyMap,
  predicate: string,
  value: ThingRdfPropertyValue,
): void => {
  properties[predicate] = [value];
};

export const addOptionalLiteral = (
  properties: SolidRdfPropertyMap,
  predicate: string,
  value: ThingRdfPropertyValue | null | undefined,
): void => {
  if (value !== null && value !== undefined) {
    addLiteral(properties, predicate, value);
  }
};

export const addArray = (
  properties: SolidRdfPropertyMap,
  predicate: string,
  values: readonly string[],
  options: { includeEmpty?: boolean } = {},
): void => {
  if (values.length > 0 || options.includeEmpty === true) {
    properties[predicate] = values;
  }
};

export const addJson = (
  properties: SolidRdfPropertyMap,
  predicate: string,
  value: unknown,
): void => {
  addLiteral(properties, predicate, {
    kind: 'literal',
    value: JSON.stringify(value),
    datatype: RDF_JSON_DATATYPE,
  });
};

export const addOptionalJson = (
  properties: SolidRdfPropertyMap,
  predicate: string,
  value: unknown,
): void => {
  if (value !== null && value !== undefined) {
    addJson(properties, predicate, value);
  }
};

export const deleteAbsentValue = (
  properties: SolidRdfPropertyMap,
  predicate: string,
  value: unknown,
): void => {
  if (value === null || value === undefined) {
    properties[predicate] = [];
  }
};

export const stringProp = (thing: Thing, predicate: string): string | undefined => {
  const value = literalProps(thing, predicate)[0]?.value;
  return typeof value === 'string' ? value : undefined;
};

export const stringOrNullProp = (
  thing: Thing,
  predicate: string,
): string | null | undefined => {
  const value = stringProp(thing, predicate);
  return value === undefined ? undefined : value;
};

export const stringArrayProp = (thing: Thing, predicate: string): string[] =>
  literalProps(thing, predicate)
    .map((value) => value.value)
    .filter((value): value is string => typeof value === 'string');

export const numberProp = (thing: Thing, predicate: string): number | undefined => {
  const value = literalProps(thing, predicate)[0]?.value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const numberOrNullProp = (
  thing: Thing,
  predicate: string,
): number | null | undefined => {
  const value = numberProp(thing, predicate);
  return value === undefined ? undefined : value;
};

export const booleanProp = (thing: Thing, predicate: string): boolean | undefined => {
  const value = literalProps(thing, predicate)[0]?.value;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

export const jsonProp = <T>(thing: Thing, predicate: string): T | undefined => {
  const raw = stringProp(thing, predicate);
  if (raw === undefined) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const literalProps = (thing: Thing, predicate: string): RdfLiteralValue[] =>
  thing.property(predicate).filter(isLiteralValue);

const isLiteralValue = (value: RdfValue): value is RdfLiteralValue =>
  value.kind === 'literal';
