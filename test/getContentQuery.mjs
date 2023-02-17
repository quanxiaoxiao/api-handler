import test from 'ava'; // eslint-disable-line
import getContentQuery from '../src/getContentQuery.mjs';

test('getContentQuery', (t) => {
  t.deepEqual(
    getContentQuery(
      null,
      null,
      null,
    ),
    {},
  );
  t.deepEqual(
    getContentQuery(
      null,
      {
        name: 'cqq',
      },
      null,
    ),
    {},
  );
  t.deepEqual(
    getContentQuery(
      null,
      { age: '22' },
      {
        name: 'cqq',
      },
    ),
    {},
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
      },
      { age: '22' },
      {
        name: 'cqq',
      },
    ),
    {
      name: 'cqq',
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        age: {
          type: 'integer',
        },
      },
      { age: '22' },
      {
        name: 'cqq',
      },
    ),
    {
      age: 22,
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
        age: {
          type: 'integer',
        },
      },
      { age: '22' },
      {
        name: 'cqq',
      },
    ),
    {
      name: 'cqq',
      age: 22,
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
        age: {
          type: 'integer',
        },
      },
      {
        name: 'quan',
        age: '22',
      },
      {
        name: 'cqq',
      },
    ),
    {
      name: 'cqq',
      age: 22,
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
        age: {
          type: 'integer',
        },
      },
      {
        name: 'quan',
      },
      {
        name: 'cqq',
        age: 'xxx',
      },
    ),
    {
      name: 'cqq',
      age: null,
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
        age: {
          type: 'integer',
        },
      },
      {
        name: 'quan',
        age: 14,
      },
      {
        name: 'cqq',
        age: 'xxx',
      },
    ),
    {
      name: 'cqq',
      age: null,
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
        age: {
          type: 'integer',
        },
      },
      {
        name: 'quan',
        age: 14,
      },
      {
        name: '',
        age: '',
      },
    ),
    {
      name: 'quan',
      age: 14,
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
        age: {
          type: 'integer',
        },
      },
      {
        name: 'quan',
        age: 14,
      },
      {
        name: '3',
        age: null,
      },
    ),
    {
      name: '3',
      age: 14,
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
        age: {
          type: 'integer',
        },
      },
      {
        name: 'quan',
        age: 14,
      },
      {
        name: '3',
        age: 0,
      },
    ),
    {
      name: '3',
      age: 0,
    },
  );
  t.deepEqual(
    getContentQuery(
      {
        name: {
          type: 'string',
        },
        age: {
          type: 'integer',
        },
      },
      {
        name: 'quan',
        age: 0,
      },
      {
        name: '  ',
        age: '',
      },
    ),
    {
      name: '  ',
      age: 0,
    },
  );
});
