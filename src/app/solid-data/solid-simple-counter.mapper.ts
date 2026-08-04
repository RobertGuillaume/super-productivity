import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import {
  SimpleCounter,
  SimpleCounterType,
} from '../features/simple-counter/simple-counter.model';
import {
  SOLID_PRODUCTIVITY_SIMPLE_COUNTERS_CONTAINER,
  SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE,
  SP_SIMPLE_COUNTER,
} from './solid-productivity-vocab';
import {
  addJson,
  addLiteral,
  addOptionalLiteral,
  booleanProp,
  deleteAbsentValue,
  jsonProp,
  numberProp,
  SolidRdfPropertyMap,
  stringOrNullProp,
  stringProp,
} from './solid-rdf.mapper-helpers';

export interface SolidSimpleCounterRecord {
  simpleCounter: SimpleCounter;
  order: number;
}

export const simpleCounterToSolidCreateInput = (
  simpleCounter: SimpleCounter,
  profile: ThingWriteProfile,
  order = 0,
): CreateThingInput => ({
  profile,
  target: {
    containerUri:
      profile.target?.containerUri ?? SOLID_PRODUCTIVITY_SIMPLE_COUNTERS_CONTAINER,
    resourceName: simpleCounter.id,
  },
  title: simpleCounterTitle(simpleCounter),
  facets: {
    title: simpleCounterTitle(simpleCounter),
    status: simpleCounter.isEnabled ? 'active' : 'disabled',
  },
  properties: simpleCounterToSolidProperties(simpleCounter, order),
});

export const simpleCounterToSolidChanges = (
  simpleCounter: SimpleCounter,
  order = 0,
): ThingChanges => ({
  title: simpleCounterTitle(simpleCounter),
  status: simpleCounter.isEnabled ? 'active' : 'disabled',
  replaceProperties: buildSimpleCounterSolidProperties(simpleCounter, order),
  deleteProperties: simpleCounterToSolidDeleteProperties(simpleCounter),
});

export const simpleCounterToSolidProperties = (
  simpleCounter: SimpleCounter,
  order = 0,
): ThingRdfPropertyInput => buildSimpleCounterSolidProperties(simpleCounter, order);

export const solidThingToSimpleCounterRecord = (
  thing: Thing,
): SolidSimpleCounterRecord => {
  const jsonSimpleCounter = jsonProp<SimpleCounter>(thing, SP_SIMPLE_COUNTER.counterData);
  const simpleCounter =
    jsonSimpleCounter ??
    ({
      id: stringProp(thing, SP_SIMPLE_COUNTER.id) ?? thing.uri,
      title: stringProp(thing, SP_SIMPLE_COUNTER.title) ?? 'Counter',
      isEnabled:
        booleanProp(thing, SP_SIMPLE_COUNTER.isEnabled) ??
        thing.facets.status !== 'disabled',
      icon: stringOrNullProp(thing, SP_SIMPLE_COUNTER.icon) ?? null,
      type:
        (stringProp(thing, SP_SIMPLE_COUNTER.type) as SimpleCounterType | undefined) ??
        SimpleCounterType.ClickCounter,
      countOnDay:
        jsonProp<Record<string, number>>(thing, SP_SIMPLE_COUNTER.countOnDay) ?? {},
      isOn: false,
    } as SimpleCounter);

  return {
    simpleCounter: {
      ...simpleCounter,
      id: stringProp(thing, SP_SIMPLE_COUNTER.id) ?? simpleCounter.id,
      title: stringProp(thing, SP_SIMPLE_COUNTER.title) ?? simpleCounter.title,
      isEnabled:
        booleanProp(thing, SP_SIMPLE_COUNTER.isEnabled) ?? simpleCounter.isEnabled,
      isHideButton:
        booleanProp(thing, SP_SIMPLE_COUNTER.isHideButton) ?? simpleCounter.isHideButton,
      icon: stringOrNullProp(thing, SP_SIMPLE_COUNTER.icon) ?? simpleCounter.icon,
      type:
        (stringProp(thing, SP_SIMPLE_COUNTER.type) as SimpleCounterType | undefined) ??
        simpleCounter.type,
      isTrackStreaks:
        booleanProp(thing, SP_SIMPLE_COUNTER.isTrackStreaks) ??
        simpleCounter.isTrackStreaks,
      streakMinValue:
        numberProp(thing, SP_SIMPLE_COUNTER.streakMinValue) ??
        simpleCounter.streakMinValue,
      streakMode:
        (stringProp(thing, SP_SIMPLE_COUNTER.streakMode) as
          | SimpleCounter['streakMode']
          | undefined) ?? simpleCounter.streakMode,
      streakWeeklyFrequency:
        numberProp(thing, SP_SIMPLE_COUNTER.streakWeeklyFrequency) ??
        simpleCounter.streakWeeklyFrequency,
      countdownDuration:
        numberProp(thing, SP_SIMPLE_COUNTER.countdownDuration) ??
        simpleCounter.countdownDuration,
      countOnDay:
        jsonProp<Record<string, number>>(thing, SP_SIMPLE_COUNTER.countOnDay) ??
        simpleCounter.countOnDay ??
        {},
      isOn: false,
    },
    order: numberProp(thing, SP_SIMPLE_COUNTER.order) ?? 0,
  };
};

export const solidThingToSimpleCounter = (thing: Thing): SimpleCounter =>
  solidThingToSimpleCounterRecord(thing).simpleCounter;

export const solidSimpleCounterQuery = {
  type: SOLID_PRODUCTIVITY_SIMPLE_COUNTER_TYPE,
} as const;

const buildSimpleCounterSolidProperties = (
  simpleCounter: SimpleCounter,
  order: number,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_SIMPLE_COUNTER.id, simpleCounter.id);
  addLiteral(properties, SP_SIMPLE_COUNTER.title, simpleCounter.title);
  addLiteral(properties, SP_SIMPLE_COUNTER.isEnabled, simpleCounter.isEnabled);
  addLiteral(properties, SP_SIMPLE_COUNTER.type, simpleCounter.type);
  addLiteral(properties, SP_SIMPLE_COUNTER.order, order);
  addJson(properties, SP_SIMPLE_COUNTER.countOnDay, simpleCounter.countOnDay ?? {});
  addJson(properties, SP_SIMPLE_COUNTER.counterData, {
    ...simpleCounter,
    isOn: false,
  });

  addOptionalLiteral(
    properties,
    SP_SIMPLE_COUNTER.isHideButton,
    simpleCounter.isHideButton,
  );
  addOptionalLiteral(properties, SP_SIMPLE_COUNTER.icon, simpleCounter.icon);
  addOptionalLiteral(
    properties,
    SP_SIMPLE_COUNTER.isTrackStreaks,
    simpleCounter.isTrackStreaks,
  );
  addOptionalLiteral(
    properties,
    SP_SIMPLE_COUNTER.streakMinValue,
    simpleCounter.streakMinValue,
  );
  addOptionalLiteral(properties, SP_SIMPLE_COUNTER.streakMode, simpleCounter.streakMode);
  addOptionalLiteral(
    properties,
    SP_SIMPLE_COUNTER.streakWeeklyFrequency,
    simpleCounter.streakWeeklyFrequency,
  );
  addOptionalLiteral(
    properties,
    SP_SIMPLE_COUNTER.countdownDuration,
    simpleCounter.countdownDuration,
  );

  return properties;
};

const simpleCounterToSolidDeleteProperties = (
  simpleCounter: SimpleCounter,
): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(
    properties,
    SP_SIMPLE_COUNTER.isHideButton,
    simpleCounter.isHideButton,
  );
  deleteAbsentValue(properties, SP_SIMPLE_COUNTER.icon, simpleCounter.icon);
  deleteAbsentValue(
    properties,
    SP_SIMPLE_COUNTER.isTrackStreaks,
    simpleCounter.isTrackStreaks,
  );
  deleteAbsentValue(
    properties,
    SP_SIMPLE_COUNTER.streakMinValue,
    simpleCounter.streakMinValue,
  );
  deleteAbsentValue(properties, SP_SIMPLE_COUNTER.streakMode, simpleCounter.streakMode);
  deleteAbsentValue(
    properties,
    SP_SIMPLE_COUNTER.streakWeeklyFrequency,
    simpleCounter.streakWeeklyFrequency,
  );
  deleteAbsentValue(
    properties,
    SP_SIMPLE_COUNTER.countdownDuration,
    simpleCounter.countdownDuration,
  );

  return properties;
};

const simpleCounterTitle = (simpleCounter: SimpleCounter): string =>
  simpleCounter.title.trim() || 'Counter';
