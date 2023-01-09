import _ from 'lodash';
import Ajv from 'ajv';
import { receiveData } from '@quanxiaoxiao/about-http';
import { pathToRegexp } from 'path-to-regexp';
import convertData from '@quanxiaoxiao/data-convert';

const METHODS = ['GET', 'POST', 'DELETE', 'PUT'];

export const parse = (apis) => {
  if (!_.isPlainObject(apis)) {
    throw new Error(`api invalid \`${JSON.stringify(apis)}\``);
  }
  const pathnameList = Object.keys(apis);
  const result = [];
  const len = pathnameList.length;
  for (let i = 0; i < len; i++) {
    const pathname = pathnameList[i];
    if (pathname[0] !== '/') {
      console.warn(`pathname \`${pathname}\` invalid`);
      continue;
    }
    const obj = apis[pathname];
    const type = typeof obj;
    if (obj == null || Array.isArray(obj) || (type !== 'object' && type !== 'function')) {
      console.warn(`\`${pathname}\` handler invalid`);
      continue;
    }
    const defaultOptions = {
      pathname,
      type: null,
      typeInput: null,
      query: null,
      contentData: null,
      convert: null,
      regexp: pathToRegexp(pathname),
    };
    if (type === 'function') {
      METHODS.forEach((method) => {
        result.push({
          ...defaultOptions,
          _id: `${pathname}@${method}`,
          method,
          fn: obj,
        });
      });
      result.push({
        ...defaultOptions,
        _id: `${pathname}@OPTIONS`,
        method: 'OPTIONS',
        fn: obj,
      });
    } else {
      const methodList = Object.keys(obj);
      for (let j = 0; j < methodList.length; j++) {
        const method = methodList[j].toUpperCase();
        if (!METHODS.includes(method)) {
          console.warn(`\`${pathname}\` method \`${methodList[j]}\` invalid`);
          continue;
        }
        const fn = obj[methodList[j]];
        if (fn == null || (typeof fn !== 'function' && typeof fn.fn !== 'function')) {
          console.warn(`\`${pathname}\` \`${methodList[j]}\` handler is not function`);
          continue;
        }
        if (fn.fn) {
          result.push({
            ...defaultOptions,
            _id: `${pathname}@${method}`,
            method,
            fn: fn.fn,
            type: fn.type ? new Ajv().compile(fn.type) : null,
            typeInput: fn.typeInput ? new Ajv().compile(fn.typeInput) : null,
            convert: fn.convert ? convertData(fn.convert) : null,
            query: fn.query || null,
            contentData: fn.contentData || null,
          });
        } else {
          result.push({
            ...defaultOptions,
            _id: `${pathname}@${method}`,
            method,
            fn,
          });
        }
      }
    }
  }
  return result;
};

const handler = (apis) => {
  const apiList = parse(apis);
  return async (ctx) => {
    const { path } = ctx;
    const method = ctx.method.toUpperCase();
    const apiMatchList = apiList.filter((d) => d.regexp.exec(path));
    if (apiMatchList.length === 0) {
      ctx.throw(404);
    }
    if (method === 'OPTIONS') {
      ctx.status = 204;
      const optionItem = apiMatchList.find((d) => d.method === 'OPTIONS');
      if (optionItem) {
        ctx.matches = optionItem.regexp.exec(path);
        await optionItem.fn(ctx);
        return null;
      }
      ctx.set(
        'allow',
        ['OPTIONS', ...apiMatchList.map((item) => item.method)].join(', '),
      );
      ctx.body = null;
      return null;
    }
    const apiItem = apiMatchList.find((d) => method === d.method);
    if (!apiItem) {
      ctx.throw(405);
    }
    if (apiItem.convert) {
      ctx.query = apiItem.convert(ctx.query || {});
    }
    if (apiItem.query) {
      ctx.query = _.merge(apiItem.query, Object.keys(ctx.query).reduce((acc, key) => {
        const v = ctx.query[key];
        if (v == null || v === '') {
          return acc;
        }
        return {
          ...acc,
          [key]: v,
        };
      }, {}));
    }
    if (apiItem.type && !apiItem.type(ctx.query)) {
      ctx.throw(400, JSON.stringify(apiItem.type.errors));
    }
    ctx.matches = apiItem.regexp.exec(path);
    if (/application\/json/.test(ctx.get('content-type')) && (method === 'PUT' || method === 'POST')) {
      try {
        const buf = await receiveData(ctx.req);
        let contentData = JSON.parse(buf);
        if (apiItem.contentData) {
          contentData = _.merge(apiItem.contentData, contentData);
        }
        if (apiItem.typeInput && !apiItem.typeInput(contentData)) {
          ctx.throw(400, JSON.stringify(apiItem.typeInput.errors));
        }
        ctx.contentData = contentData;
      } catch (error) {
        ctx.throw(400, error.message);
      }
    }
    const ret = await apiItem.fn(ctx);
    if (typeof ret === 'undefined') {
      ctx.throw(404);
    }
    ctx.body = ret;
    return ret;
  };
};

export default handler;
