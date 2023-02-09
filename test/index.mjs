import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('handler callback', async (t) => {
  t.plan(2);
  const handler = api({
    '/test': {
      get: () => ({
        name: 'test',
      }),
    },
  });
  const ctx = {
    method: 'GET',
    path: '/test',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: (statusCode) => {
      throw createError(statusCode == null ? 500 : statusCode);
    },
  };
  await handler(ctx, () => {
    t.pass();
  });
  t.deepEqual(ctx.body, { name: 'test' });
  ctx.path = '/notfound';
  await handler(ctx, () => {
    t.pass();
  });
});

test('receiveData', async (t) => {
  const handler = api({
    '/test': {
      post: {
        typeInput: {
          type: 'object',
        },
        fn: (ctx) => ({
          name: ctx.contentData.name,
        }),
      },
    },
    '/test2': {
      post: (ctx) => (ctx.contentData ? ({
        name: ctx.contentData.name,
      }) : ({
        name: 'xxx',
      })),
    },
  });
  const ctx = {
    method: 'POST',
    path: '/test',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: (statusCode) => {
      throw createError(statusCode == null ? 500 : statusCode);
    },
  };
  ctx.req = createReadStream('test.json');
  ctx.set('content-type', 'application/json');
  await handler(ctx, () => {
  });
  t.deepEqual(ctx.body, { name: 'test' });
  ctx.path = '/test2';
  ctx.req = createReadStream('test3.json');
  ctx.set('content-type', 'octec/stream');
  await handler(ctx, () => {
  });
  t.deepEqual(ctx.body, { name: 'xxx' });
});

test('checkDataValid', async (t) => {
  const handler = api({
    '/test': {
      post: {
        typeInput: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            age: {
              type: 'integer',
            },
          },
          additionalProperties: false,
          required: ['name', 'age'],
        },
        fn: (ctx) => ({
          name: ctx.contentData.name,
          age: ctx.contentData.age,
        }),
      },
    },
  });
  t.plan(2);
  const ctx = {
    method: 'POST',
    path: '/test',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: () => {
      t.pass();
    },
  };
  ctx.req = createReadStream('test.json');
  ctx.set('content-type', 'application/json');
  ctx.method = 'POST';
  await handler(ctx, () => {});
  ctx.contentData = null;
  ctx.req = createReadStream('test5.json');
  ctx.set('content-type', 'application/json');
  await handler(ctx, () => {});
  t.deepEqual(ctx.body, { name: 'test', age: 33 });
});

test('nest', async (t) => {
  const handler = api({
    '/test/(.*)': () => api({
      '/test/cqq': {
        get: () => ({
          name: 'cqq',
        }),
      },
    }),
  });
  const ctx = {
    method: 'GET',
    path: '/test/cqq',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: () => {
      t.pass();
    },
  };
  await handler(ctx, () => {});
  t.deepEqual(ctx.body, { name: 'cqq' });
});

test('type', async (t) => {
  const handler = api({
    '/test/cqq': {
      get: {
        type: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            age: {
              type: 'integer',
            },
          },
          required: ['age'],
        },
        fn: (ctx) => ({
          name: ctx.query.name,
          age: ctx.query.age,
        }),
      },
    },
  });
  const ctx = {
    method: 'GET',
    path: '/test/cqq',
    set: (name, value) => {
      ctx[name] = value;
    },
    get: (name) => ctx[name],
    throw: () => {
    },
  };
  ctx.query = {
    name: 'cqq',
    age: '30',
  };
  await handler(ctx, () => {});
  t.deepEqual(ctx.body, { name: 'cqq', age: 30 });
});
