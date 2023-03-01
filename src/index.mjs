import _ from 'lodash';
import Ajv from 'ajv';
import createError from 'http-errors';
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
      fn: null,
      onPost: () => {},
      onPre: () => {},
      select: (d) => d,
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
      const methodList = Object.keys(obj).filter((method) => METHODS.includes(method.toUpperCase()));
      if (obj.select) {
        try {
          defaultOptions.select = select(obj.select);
        } catch (error) {
          const errorMessage = error.message;
          defaultOptions.select = () => {
            throw createError(500, errorMessage);
          };
        }
      }
      if (typeof obj.onPre === 'function') {
        defaultOptions.onPre = obj.onPre;
      }
      if (typeof obj.onPost === 'function') {
        defaultOptions.onPost = obj.onPost;
      }
      for (let j = 0; j < methodList.length; j++) {
        const method = methodList[j].toUpperCase();
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
            const errorMessage = error.message;
            console.warn(`\`${pathname}\` \`${methodList[j]}\` parse type fail, ${errorMessage}`);
            options.type = () => {
              throw createError(500, errorMessage);
            };
          }
          try {
            if (fn.typeInput) {
              options.typeInput = new Ajv({ strict: false }).compile(fn.typeInput);
            }
          } catch (error) {
            const errorMessage = error.message;
            console.warn(`\`${pathname}\` \`${methodList[j]}\` parse typeInput fail, ${error.message}`);
            options.typeInput = () => {
              throw createError(500, errorMessage);
            };
          }
          try {
            if (fn.select) {
              options.select = select(fn.select);
            }
          } catch (error) {
            const errorMessage = error.message;
            console.warn(`\`${pathname}\` \`${methodList[j]}\` parse select fail, ${error.message}`);
            options.select = () => {
              throw createError(500, errorMessage);
            };
          }
          options.fn = fn.fn;
          if (fn.query) {
            options.query = fn.query;
          }
          if (fn.data) {
            options.data = fn.data;
          }
          if (typeof fn.onPre === 'function') {
            options.onPre = fn.onPre;
          }
          if (typeof fn.onPost === 'function') {
            options.onPost = fn.onPost;
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

const responseToOption = async (ctx, next, apiMatchList) => {
  ctx.status = 204;
  const optionItem = apiMatchList.find((d) => d.method === 'OPTIONS');
  if (optionItem) {
    ctx.matches = optionItem.regexp.exec(ctx.path);
    await optionItem.fn(ctx, next);
  } else {
    ctx.set(
      'allow',
      ['OPTIONS', ...apiMatchList.map((item) => item.method)].join(', '),
    );
    ctx.set(
      'x-match-path',
      _.get(_.first(apiMatchList), 'pathname', ''),
    );
    ctx.body = null;
  }
};

const setContentQuery = (ctx, apiItem) => {
  ctx.contentQuery = getContentQuery(
    _.get(apiItem, 'type.schema.properties'),
    apiItem.query,
    ctx.query,
  );
  if (apiItem.type && !apiItem.type(ctx.contentQuery)) {
    ctx.throw(400, JSON.stringify(apiItem.type.errors));
  }
};

const setContentData = async (ctx, apiItem) => {
  if (apiItem.typeInput) {
    if (typeof ctx.contentData === 'undefined' && ctx.req.readable) {
      try {
        const buf = await receiveData(ctx.req);
        const contentData = JSON.parse(buf);
        ctx.contentData = apiItem.data
          ? merge(apiItem.data, contentData)
          : contentData;
      } catch (error) {
        console.warn(`${ctx.path} [${ctx.method}], ${error.message}`);
        ctx.throw(500);
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
      responseToOption(ctx, next, apiMatchList);
    } else {
      const apiItem = apiMatchList.find((d) => method === d.method);
      if (!apiItem) {
        ctx.throw(405);
      }
      ctx.matches = apiItem.regexp.exec(path);
      setContentQuery(ctx, apiItem);
      await setContentData(ctx, apiItem);
      if (apiItem.onPre) {
        await apiItem.onPre(ctx);
      }
      const ret = await apiItem.fn(ctx, next);
      if (typeof ret === 'function') {
        await ret(ctx, next);
      } else {
        ctx.body = apiItem.select(ret);
        if (apiItem.onPost) {
          await apiItem.onPost(ctx);
        }
      }
    }
  };
};

export default handler;
