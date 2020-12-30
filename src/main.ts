import { MockRule, not, header, path, method, request, allOf, anyOf, body } from './rules';
import { startMockServer } from './server';

request;
const rules: MockRule[] = [
  //{
  //  match: path('/api/with-url/:extra'),
  //  respond: (_req, ctx) => {
  //    return { ...ctx, extra: 'yes' };
  //  },
  //},
  //{
  //  match: method('get'),
  //  respond: (_req, ctx) => {
  //    return { ...ctx, verb: 'get' };
  //  }
  //},
  //{
  //  match: request('get', '/api/dual'),
  //  respond: (_req, ctx) => {
  //    return { ...ctx, dual: true };
  //  }
  //},
  //{
  //  match: anyOf([
  //    allOf([
  //      method('get'),
  //      path('/foo/:id'),
  //      header('accept', 'text/xml'),
  //    ]),
  //    method('post'),
  //  ]),
  //  respond: withMock([
  //    status(200),
  //    body((req, ctx) => )
  //  ])
  //},
  {
    match: not(method('post')),
    respond: () => ({ not: 'post' })
  },
  withPassthruMock([
    status(200),
    modifiedBody(body => ({ ...body, status: 123 }))
  ])
  withStaticMock([
    status(200),
    mock((ctx, req, body) => ({ ...body, status: 'OverDue' })),
  ])
  //{
  //  match: anyOf([
  //    allOf([
  //      method('get'),
  //      body(_ => true),
  //      header('accept', 'text/xml'),
  //    ]),
  //    allOf([
  //      method('post'),
  //      path('/api/merchant/:merchantId'),
  //      body(body => body.status === 'open'),
  //    ]),
  //  ]),
  //  respond: (_req, ctx) => {
  //    return {
  //      contentType: ctx.headers.accept
  //    };
  //  }
  //},
];

startMockServer(rules);
