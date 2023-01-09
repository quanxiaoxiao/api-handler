import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from "node:url";
import createError from 'http-errors';
import test from 'ava'; // eslint-disable-line
import api, { parse } from '../src/index.mjs';

const createReadStream = (name) => {
  const rs = fs.createReadStream(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data', name)); // eslint-disable-line
  return rs;
};

test('parse api', (t) => {
  t.throws(() => {
    parse([]);
  });
  t.deepEqual(parse({}), []);

  t.deepEqual(parse({
    test: {
      get: () => ({
        name: 'test',
      }),
    },
    cqq: () => ({
      name: 'cqq',
    }),
    '/1': 1,
    '/2': '2',
    '/3': null,
    '/4': [],
  }), []);

  let apis = {
    '/test': {
      get: () => ({
        name: 'test',
      }),
    },
    '/cqq': (ctx) => ({
      name: 'cqq',
      method: ctx.method,
    }),
  };

  t.is(parse(apis).length, 6);
  apis = {
    '/get': {
      get: () => ({
        name: 'test',
      }),
    },
    '/post': {
      post: () => ({
        name: 'test',
      }),
    },
    '/invalid': {
      invalid: () => ({
        name: 'test',
      }),
    },
    '/invalid/body/1': {
      get: 1,
    },
    '/2': {
      get: null,
      post: {},
      put: () => ({}),
    },
  };
  const ret = parse(apis);
  t.is(ret[0].method, 'GET');
  t.is(ret[1].method, 'POST');
  t.is(ret[2].method, 'PUT');
  t.is(ret.length, 3);
});

test('handler', async (t) => {
  const handler = api({
    '/get': {
      get: () => ({
        name: 'get',
      }),
    },
    '/get/post': {
      get: () => ({
        name: 'get',
      }),
      post: () => ({
        name: 'post',
      }),
    },
    '/cqq': (ctx) => ({
      name: 'cqq',
      method: ctx.method,
    }),
    '/notfound': {
      get: () => {
      },
    },
    '/empty': {
      get: () => null,
    },
    '/1/(.*)': {
      get: (ctx) => ctx.matches[1],
    },
    '/post/1': {
      post: (ctx) => ctx.contentData,
    },
  });
  const ctx = {
    method: 'GET',
    path: '/get',
    'content-type': 'application/json',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: (statusCode) => {
      throw createError(statusCode == null ? 500 : statusCode);
    },
  };
  await handler(ctx);
  t.deepEqual(ctx.body, { name: 'get' });
  await t.throwsAsync(async () => {
    ctx.req = createReadStream('test.json');
    ctx.method = 'POST';
    await handler(ctx);
  });
  await t.throwsAsync(async () => {
    ctx.method = 'GET';
    ctx.path = '/notfound';
    await handler(ctx);
  });
  ctx.path = '/cqq';
  ctx.method = 'GET';
  await handler(ctx);
  t.deepEqual(ctx.body, { name: 'cqq', method: 'GET' });
  ctx.method = 'POST';
  ctx.req = createReadStream('test.json');
  await handler(ctx);
  t.deepEqual(ctx.body, { name: 'cqq', method: 'POST' });
  t.deepEqual(ctx.contentData, { name: 'test' });
  await t.throwsAsync(async () => {
    ctx.method = 'GET';
    ctx.path = '/404';
    await handler(ctx);
  });
  ctx.path = '/empty';
  ctx.method = 'GET';
  await handler(ctx);
  t.is(ctx.body, null);
  ctx.path = '/1/cqq';
  await handler(ctx);
  t.is(ctx.body, 'cqq');
  ctx.path = '/1/quan';
  await handler(ctx);
  t.is(ctx.body, 'quan');
  await t.throwsAsync(async () => {
    ctx.path = '/1';
    await handler(ctx);
  });
  ctx.path = '/get/post';
  ctx.method = 'OPTIONS';
  await handler(ctx);
  t.is(ctx.body, null);
  t.is(ctx.status, 204);
  t.is(ctx.get('allow'), 'OPTIONS, GET, POST');

  ctx.path = '/post/1';
  ctx.method = 'POST';
  ctx.req = createReadStream('test.json');
  await handler(ctx);
  t.deepEqual(ctx.body, { name: 'test' });
});

test('api nest', async (t) => {
  const handler = api({
    '/(1)/(.*)': (ctx) => {
      if (ctx.method !== 'GET' && ctx.method !== 'POST' && ctx.method !== 'OPTIONS') {
        ctx.throw(405);
      }
      const prefix = `/${ctx.matches[1]}`;
      if (ctx.method === 'POST') {
        ctx.req = createReadStream('test2.json');
      }
      return api({
        [`${prefix}/cqq`]: {
          get: () => ({
            name: 'cqq',
            method: 'GET',
          }),
        },
        [`${prefix}/quan`]: {
          post: () => ({
            name: 'quan',
            method: 'POST',
          }),
        },
        [`${prefix}/test`]: {
          get: () => 'GET',
          post: () => 'POST',
        },
      })(ctx);
    },
  });
  const ctx = {
    method: 'GET',
    path: '/1/cqq',
    'content-type': 'application/json',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: (statusCode) => {
      throw createError(statusCode == null ? 500 : statusCode);
    },
  };
  await handler(ctx);
  t.is(ctx.body.name, 'cqq');
  t.is(ctx.body.method, 'GET');
  await t.throwsAsync(async () => {
    ctx.req = createReadStream('test.json');
    ctx.method = 'POST';
    await handler(ctx);
  });
  await t.throwsAsync(async () => {
    ctx.req = createReadStream('test.json');
    ctx.method = 'POST';
    ctx.path = '/1/notfound';
    await handler(ctx);
  });
  ctx.method = 'POST';
  ctx.path = '/1/quan';
  ctx.req = createReadStream('test2.json');
  await handler(ctx);
  t.is(ctx.body.method, 'POST');
  t.is(ctx.body.name, 'quan');
  t.deepEqual(ctx.contentData, { name: 'test' });
  await t.throwsAsync(async () => {
    ctx.method = 'OPTIONS';
    ctx.path = '/1/333';
    await handler(ctx);
  });
  ctx.method = 'OPTIONS';
  ctx.path = '/1/test';
  await handler(ctx);
  t.is(ctx.get('allow'), 'OPTIONS, GET, POST');
  await t.throwsAsync(async () => {
    ctx.req = createReadStream('test.json');
    ctx.method = 'PUT';
    await handler(ctx);
  });
});

test('validate', async (t) => {
  const handler = api({
    '/cqq': {
      get: {
        type: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              nullable: false,
            },
            age: {
              type: 'integer',
              nullable: false,
            },
          },
          additionalProperties: true,
          required: ['name', 'age'],
        },
        convert: {
          name: 'string',
          age: 'integer',
        },
        fn: (ctx) => ({ name: 'cqq', age: ctx.query.age }),
      },
      post: {
        typeInput: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              nullable: false,
            },
            age: {
              type: 'integer',
              nullable: false,
            },
          },
          additionalProperties: false,
          required: ['name'],
        },
        fn: (ctx) => ({ name: ctx.contentData.name }),
      },
    },
  });
  const ctx = {
    method: 'GET',
    path: '/cqq',
    'content-type': 'application/json',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: (statusCode) => {
      throw createError(statusCode == null ? 500 : statusCode);
    },
  };
  await t.throwsAsync(async () => {
    await handler(ctx);
  });
  ctx.query = {
    name: 'cqq',
    age: '22',
  };
  await handler(ctx);
  t.is(ctx.body.name, 'cqq');
  t.is(ctx.body.age, 22);
  ctx.method = 'POST'
  ctx.req = createReadStream('test3.json');
  await handler(ctx);
  t.deepEqual(ctx.body, { name: 'test3' });
  await t.throwsAsync(async () => {
    ctx.req = createReadStream('test4.json');
    await handler(ctx);
  });
  await t.throwsAsync(async () => {
    ctx.req = createReadStream('test5.json');
    await handler(ctx);
  });
  ctx.req = createReadStream('test3.json');
  await handler(ctx);
  t.deepEqual(ctx.body, { name: 'test3' });
});

test('default value', async (t) => {
  const handler = api({
    '/cqq': {
      post: {
        query: {
          age: 12,
          cqq: '123',
        },
        contentData: {
          ccc: 'bar',
          name: 'contentData',
        },
        convert: {
          age: 'integer',
          cqq: 'string',
        },
        fn: (ctx) => ({
          name: ctx.contentData.name,
          ccc: ctx.contentData.ccc,
          age: ctx.query.age,
          cqq: ctx.query.cqq,
        }),
      },
    },
  });
  const ctx = {
    method: 'POST',
    'content-type': 'application/json',
    path: '/cqq',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: (statusCode) => {
      throw createError(statusCode == null ? 500 : statusCode);
    },
  };
  ctx.req = createReadStream('test4.json');
  ctx.query = {
    cqq: 'cqq',
  };
  await handler(ctx);
  t.deepEqual(ctx.body, { cqq: 'cqq', age: 12, name: 'test4', ccc: 'bar' });
});
