import express, { RequestHandler } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createEvaluator, MockRule } from './rules';

const DEFAULT_CONFIG = {
  port: 3535,
} as const;

export function startMockServer(rules: MockRule[], config = DEFAULT_CONFIG): any {
  const app = express();
  const proxy = createProxy();
  const ruleEvaluators = rules.map(createEvaluator);

  app.use(express.json({ limit: '100mb' }));

  app.all('*', async (req, res, next) => {
    for (const evaluate of ruleEvaluators) {
      const result = await evaluate(req);

      console.log('@@@@@@@@@@@@@@@@@@@@@')
      console.dir(result, { depth: Infinity });
      console.log('@@@@@@@@@@@@@@@@@@@@@')
      if (result.ok) {
        res.json(result.response).end();
      } else {
        proxy(req, res, next);
      }
      console.log('---------------------')
    }
  });

  app.listen(config.port, () => {
    console.log(`Started proxy on port ${config.port}`);
  });

  return app;
}

// @TODO set up the two different proxy types
//
// The first is where the mock server acts as a global http proxy and will be
// handling requests for all hosts. This means we need to support https and and
// we'll be forwarding to potentially any host when we passthru. This would be
// used through a browser extension proxying all requests, so that no additional
// config is needed on the server you're trying to mock
//
// The second is a single-target proxy where requests are being sent directly to
// the mock server through a single endpoint. This would mean swapping out
// something like BACKEND_URL to point directly to the mock server
function createProxy(proxyConfig: any = {}): RequestHandler {
  if (proxyConfig.type === 'global') {
    return createProxyMiddleware({
      target: '/',
      router: (req) => ({
        host: req.hostname,
        protocol: req.protocol,
      })
    });
  } else {
    return (req, res) => {
      const { originalUrl, method } = req;
      console.error(`Hitting 'real' url with ${method} ${originalUrl}`)
      res.json({ real: 'endpoint' }).end()
    }
  }
}