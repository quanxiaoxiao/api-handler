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
      _.isPlainObject(raw) ? raw : {},
    ),
  );
};

export default getContentQuery;
