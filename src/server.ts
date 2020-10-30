import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { orRule, dualRule, secondRule, testRule, createEvaluator } from './rules';

const config = {
  port: 3535,
  proxyPrefix: '/api',
  proxyTarget: 'https://www.google.com/'
};

const app = express();
app.use(express.json({ limit: '100mb' }));

const evaler = createEvaluator(testRule);
const evaler2 = createEvaluator(secondRule);
const evaler3 = createEvaluator(dualRule);
const evaler4 = createEvaluator(orRule);
app.all('*', async (req, res) => {
  console.log('==========URL===========')
  console.dir(await evaler(req), { depth: Infinity })
  console.log('==========VERB==========')
  console.dir(await evaler2(req), { depth: Infinity })
  console.log('==========AND(VERB+URL)===========')
  console.dir(await evaler3(req), { depth: Infinity })
  console.log('==========OR(VERB+URL)===========')
  console.dir(await evaler4(req), { depth: Infinity })
  res.end();
});

app.use(config.proxyPrefix, createProxyMiddleware({
  target: config.proxyTarget,
  changeOrigin: true
}));

app.listen(config.port, () => {
  console.log(`Started proxy on port ${config.port}`);
});