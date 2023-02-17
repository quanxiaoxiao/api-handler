import _ from 'lodash';
import { convertDataValue, merge } from '@quanxiaoxiao/data-convert';

const convert = (properties, data) => {
  const result = {};
  const keys = Object.keys(properties);
  for (let i = 0; i < keys.length; i++) {
    const dataKey = keys[i];
    const dataType = _.get(properties, `${dataKey}.type`);
    if (['string', 'number', 'integer', 'boolean'].includes(dataType)) {
      result[dataKey] = convertDataValue(_.get(data, dataKey), dataType);
    }
  }
  return result;
};

const getContentQuery = (
  properties,
  queryDefault,
  raw,
) => {
  if (_.isEmpty(properties) || !_.isPlainObject(properties)) {
    return {};
  }
  return convert(
    properties,
    merge(
      _.isPlainObject(queryDefault) ? queryDefault : {},
      Object
        .keys(_.isPlainObject(raw) ? raw : {})
        .reduce((acc, dataKey) => {
          const v = raw[dataKey];
          if (v == null || v === '') {
            return acc;
          }
          return {
            ...acc,
            [dataKey]: v,
          };
        }, {}),
    ),
  );
};

export default getContentQuery;
