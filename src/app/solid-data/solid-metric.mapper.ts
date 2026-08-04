import type {
  CreateThingInput,
  Thing,
  ThingChanges,
  ThingRdfPropertyInput,
  ThingWriteProfile,
} from '@solid-intents/runtime';
import { Metric } from '../features/metric/metric.model';
import {
  SOLID_PRODUCTIVITY_METRICS_CONTAINER,
  SOLID_PRODUCTIVITY_METRIC_TYPE,
  SP_METRIC,
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

export const metricToSolidCreateInput = (
  metric: Metric,
  profile: ThingWriteProfile,
): CreateThingInput => ({
  profile,
  target: {
    containerUri: profile.target?.containerUri ?? SOLID_PRODUCTIVITY_METRICS_CONTAINER,
    resourceName: metric.id,
  },
  title: metricTitle(metric),
  facets: {
    title: metricTitle(metric),
    status: 'active',
  },
  properties: metricToSolidProperties(metric),
});

export const metricToSolidChanges = (metric: Metric): ThingChanges => ({
  title: metricTitle(metric),
  status: 'active',
  replaceProperties: buildMetricSolidProperties(metric),
  deleteProperties: metricToSolidDeleteProperties(metric),
});

export const metricToSolidProperties = (metric: Metric): ThingRdfPropertyInput =>
  buildMetricSolidProperties(metric);

export const solidThingToMetric = (thing: Thing): Metric => {
  const jsonMetric = jsonProp<Metric>(thing, SP_METRIC.metricData);
  const metric =
    jsonMetric ??
    ({
      id: stringProp(thing, SP_METRIC.id) ?? thing.uri,
    } as Metric);

  let mappedMetric: Metric = {
    ...metric,
    id: stringProp(thing, SP_METRIC.id) ?? metric.id,
  };

  const notes = stringOrNullProp(thing, SP_METRIC.notes);
  if (notes !== undefined) mappedMetric = { ...mappedMetric, notes };

  const remindTomorrow = booleanProp(thing, SP_METRIC.remindTomorrow);
  if (remindTomorrow !== undefined) mappedMetric = { ...mappedMetric, remindTomorrow };

  const impactOfWork = numberProp(thing, SP_METRIC.impactOfWork);
  if (impactOfWork !== undefined) mappedMetric = { ...mappedMetric, impactOfWork };

  const energyCheckin = numberProp(thing, SP_METRIC.energyCheckin);
  if (energyCheckin !== undefined) mappedMetric = { ...mappedMetric, energyCheckin };

  const totalWorkMinutes = numberProp(thing, SP_METRIC.totalWorkMinutes);
  if (totalWorkMinutes !== undefined) {
    mappedMetric = { ...mappedMetric, totalWorkMinutes };
  }

  const completedTasks = numberProp(thing, SP_METRIC.completedTasks);
  if (completedTasks !== undefined) mappedMetric = { ...mappedMetric, completedTasks };

  const plannedTasks = numberProp(thing, SP_METRIC.plannedTasks);
  if (plannedTasks !== undefined) mappedMetric = { ...mappedMetric, plannedTasks };

  const focusSessions = jsonProp<number[]>(thing, SP_METRIC.focusSessions);
  if (focusSessions !== undefined) mappedMetric = { ...mappedMetric, focusSessions };

  const reflections = jsonProp<Metric['reflections']>(thing, SP_METRIC.reflections);
  if (reflections !== undefined) mappedMetric = { ...mappedMetric, reflections };

  return mappedMetric;
};

export const solidMetricQuery = {
  type: SOLID_PRODUCTIVITY_METRIC_TYPE,
} as const;

const buildMetricSolidProperties = (metric: Metric): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  addLiteral(properties, SP_METRIC.id, metric.id);
  addJson(properties, SP_METRIC.metricData, metric);

  addOptionalLiteral(properties, SP_METRIC.notes, metric.notes);
  addOptionalLiteral(properties, SP_METRIC.remindTomorrow, metric.remindTomorrow);
  addOptionalLiteral(properties, SP_METRIC.impactOfWork, metric.impactOfWork);
  addOptionalLiteral(properties, SP_METRIC.energyCheckin, metric.energyCheckin);
  addOptionalLiteral(properties, SP_METRIC.totalWorkMinutes, metric.totalWorkMinutes);
  addOptionalLiteral(properties, SP_METRIC.completedTasks, metric.completedTasks);
  addOptionalLiteral(properties, SP_METRIC.plannedTasks, metric.plannedTasks);
  addJson(properties, SP_METRIC.focusSessions, metric.focusSessions ?? []);
  addJson(properties, SP_METRIC.reflections, metric.reflections ?? []);

  return properties;
};

const metricToSolidDeleteProperties = (metric: Metric): ThingRdfPropertyInput => {
  const properties: SolidRdfPropertyMap = {};

  deleteAbsentValue(properties, SP_METRIC.notes, metric.notes);
  deleteAbsentValue(properties, SP_METRIC.remindTomorrow, metric.remindTomorrow);
  deleteAbsentValue(properties, SP_METRIC.impactOfWork, metric.impactOfWork);
  deleteAbsentValue(properties, SP_METRIC.energyCheckin, metric.energyCheckin);
  deleteAbsentValue(properties, SP_METRIC.totalWorkMinutes, metric.totalWorkMinutes);
  deleteAbsentValue(properties, SP_METRIC.completedTasks, metric.completedTasks);
  deleteAbsentValue(properties, SP_METRIC.plannedTasks, metric.plannedTasks);

  return properties;
};

const metricTitle = (metric: Metric): string => `Metric ${metric.id}`;
