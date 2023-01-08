import _ from 'lodash';
import { pathToRegexp } from 'path-to-regexp';

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
    if (type === 'function') {
      METHODS.forEach((method) => {
        result.push({
          _id: `${pathname}@${method}`,
          pathname,
          method,
          regexp: pathToRegexp(pathname),
          fn: obj,
        });
      });
      result.push({
        _id: `${pathname}@OPTIONS`,
        pathname,
        method: 'OPTIONS',
        regexp: pathToRegexp(pathname),
        fn: obj,
      });
    } else {
      const methodList = Object.keys(obj);
      for (let j = 0; j < methodList.length; j++) {
        const method = methodList[j].toUpperCase();
        if (!METHODS.includes(method)) {
          console.warn(`\`${pathname}\` method \`${method}\` invalid`);
          continue;
        }
        const fn = obj[methodList[j]];
        if (typeof fn !== 'function') {
          console.warn(`\`${pathname}\` \`${method}\` handler is not function`);
          continue;
        }
        result.push({
          _id: `${pathname}@${method}`,
          pathname,
          regexp: pathToRegexp(pathname),
          method,
          fn,
        });
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
    ctx.matches = apiItem.regexp.exec(path);
    const ret = await apiItem.fn(ctx);
    if (typeof ret === 'undefined') {
      ctx.throw(404);
    }
    ctx.body = ret;
    return ret;
  };
};

export default handler;
