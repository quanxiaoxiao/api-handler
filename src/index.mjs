import _ from 'lodash';
import Ajv from 'ajv';
import { receiveData } from '@quanxiaoxiao/about-http';
import { pathToRegexp } from 'path-to-regexp';
import { merge, select } from '@quanxiaoxiao/data-convert';
import getContentQuery from './getContentQuery.mjs';

const METHODS = ['GET', 'POST', 'DELETE', 'PUT'];

export const parse = (apis) => {
  if (!_.isPlainObject(apis)) {
    throw new Error(`api invalid \`${JSON.stringify(apis)}\``);
  }
  const pathnameList = Object.keys(apis);
  const result = [];
  for (let i = 0; i < pathnameList.length; i++) {
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
      data: null,
      select: null,
      fn: null,
      regexp: pathToRegexp(pathname),
    };
    if (type === 'function') {
      METHODS.forEach((method) => {
        result.push({
          ...defaultOptions,
          method,
          fn: obj,
        });
      });
      result.push({
        ...defaultOptions,
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
        const options = {
          ...defaultOptions,
          method,
        };
        const fn = obj[methodList[j]];
        if (fn == null || (typeof fn !== 'function' && typeof fn.fn !== 'function')) {
          console.warn(`\`${pathname}\` \`${methodList[j]}\` handler is not function`);
          continue;
        }
        if (fn.fn) {
          try {
            if (fn.type) {
              options.type = new Ajv({ strict: false }).compile(fn.type);
            }
          } catch (error) {
            console.warn(`\`${pathname}\` \`${methodList[j]}\` parse type fail, ${error.message}`);
          }
          try {
            if (fn.typeInput) {
              options.typeInput = new Ajv({ strict: false }).compile(fn.typeInput);
            }
          } catch (error) {
            console.warn(`\`${pathname}\` \`${methodList[j]}\` parse typeInput fail, ${error.message}`);
          }
          try {
            if (fn.select) {
              options.select = select(fn.select);
            }
          } catch (error) {
            console.warn(`\`${pathname}\` \`${methodList[j]}\` parse select fail, ${error.message}`);
          }
          options.fn = fn.fn;
          if (fn.query) {
            options.query = fn.query;
          }
          if (fn.data) {
            options.data = fn.data;
          }
        } else {
          options.fn = fn;
        }
        result.push(options);
      }
    }
  }
  return result;
};

const handler = (apis) => {
  const apiList = parse(apis);
  return async (ctx, next) => {
    const { path } = ctx;
    const method = ctx.method.toUpperCase();
    const apiMatchList = apiList.filter((d) => d.regexp.exec(path));
    if (apiMatchList.length === 0) {
      await next();
    } else if (method === 'OPTIONS') {
      ctx.status = 204;
      const optionItem = apiMatchList.find((d) => d.method === 'OPTIONS');
      if (optionItem) {
        ctx.matches = optionItem.regexp.exec(path);
        await optionItem.fn(ctx, next);
      } else {
        ctx.set(
          'allow',
          ['OPTIONS', ...apiMatchList.map((item) => item.method)].join(', '),
        );
        ctx.body = null;
      }
    } else {
      const apiItem = apiMatchList.find((d) => method === d.method);
      if (!apiItem) {
        ctx.throw(405);
      }
      ctx.contentQuery = getContentQuery(
        _.get(apiItem, 'type.schema.properties'),
        apiItem.query,
        ctx.query,
      );
      if (apiItem.type && !apiItem.type(ctx.contentQuery)) {
        ctx.throw(400, JSON.stringify(apiItem.type.errors));
      }
      ctx.matches = apiItem.regexp.exec(path);
      if (apiItem.typeInput) {
        if (typeof ctx.contentData === 'undefined' && ctx.req.readable) {
          try {
            const buf = await receiveData(ctx.req);
            const contentData = JSON.parse(buf);
            ctx.contentData = apiItem.data
              ? merge(apiItem.data, contentData)
              : contentData;
          } catch (error) {
            ctx.throw(400, error.message);
          }
        }
      } else if (typeof ctx.contentData !== 'undefined') {
        delete ctx.contentData;
      }
      if (apiItem.typeInput
        && typeof ctx.contentData !== 'undefined'
        && !apiItem.typeInput(ctx.contentData)
      ) {
        ctx.throw(400, JSON.stringify(apiItem.typeInput.errors));
      }
      const ret = await apiItem.fn(ctx, next);
      if (typeof ret === 'function') {
        await ret(ctx, next);
      } else {
        ctx.body = apiItem.select ? apiItem.select(ret) : ret;
      }
    }
  };
};

export default handler;
