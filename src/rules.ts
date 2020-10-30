import { Request } from 'express';
import { match as createPathMatch } from 'path-to-regexp';

//-----------------------------------------------------------------------------
// Example rules
//-----------------------------------------------------------------------------

export const testRule: MockRule = {
  match: withUrl('/api/with-url/:extra'),
  respond: (_req: Request, ctx: any) => {
    return { ...ctx, extra: 'yes' };
  }
}

export const secondRule: MockRule = {
  match: withVerb('get'),
  respond: (_req: Request, ctx: any) => {
    return { ...ctx, verb: 'get' };
  }
}

export const dualRule: MockRule = {
  match: allOf([
    withVerb('get'),
    withUrl('/api/dual'),
  ]),
  respond: (_req: Request, ctx: any) => {
    return { ...ctx, dual: true };
  }
}

export const orRule: MockRule = {
  match: oneOf([
    withVerb('get'),
    withUrl('/api/dual'),
  ]),
  respond: (_req: Request, ctx: any) => {
    return { ...ctx, dual: true };
  }
}

//-----------------------------------------------------------------------------
// Types
//-----------------------------------------------------------------------------

export interface MockRule {
  match: Matcher | Matcher[];
  respond: <T>(res: Request, ctx: T) => object;
}

type PromiseOrNot<T> = Promise<T> | T;

export interface MatcherResult {
  found: boolean;
  error?: Error;
  name?: string;
  children?: MatcherResult[];
  ctx?: Record<string, any>
}

export type RuleResult = 
  | { ok: true, matcher: MatcherResult, response: object }
  | { ok: false };

export type Matcher = (r: Request) => PromiseOrNot<MatcherResult>
export type RuleEvaluator = (r: Request) => Promise<RuleResult>;

//-----------------------------------------------------------------------------
// Matcher factories
//-----------------------------------------------------------------------------

function withUrl(url: string): Matcher {
  const matchPath = createPathMatch(url);
  return ({ path }) => {
    const matched = matchPath(path);
    const params = (matched) ? matched.params : {};
    const found = (matched !== false);
    return {
      found,
      name: `withUrl::${url}`,
      ctx: {
        path,
        params,
      }
    };
  };
}

function withVerb(verb: string): Matcher {
  return ({ method }) => {
    return {
      found: method === verb.toUpperCase(),
      name: `verb::${verb}`,
      ctx: { method }
    };
  };
}

function oneOf(matchers: Matcher[]): Matcher {
  const merger = matchResultsMerger((a, b) => a || b);
  const matcher = joinMatchersWith(matchers, merger)
  return renameResult('oneOf', matcher);
}

function allOf(matchers: Matcher[]): Matcher {
  const merger = matchResultsMerger((a, b) => a && b);
  const matcher = joinMatchersWith(matchers, merger)
  return renameResult('allOf', matcher);
}

//-----------------------------------------------------------------------------
// Idk other stuff
//-----------------------------------------------------------------------------

/**
 * Creates a function for evaluating a rule against a request and generating
 * the response if it matches
 */
export function createEvaluator({ match, respond }: MockRule): RuleEvaluator {
  const matcher: Matcher = (
    (Array.isArray(match))
      ? allOf(match)
      : req => normalizePromise(match(req))
  );

  return async (req: Request) => {
    const match = await matcher(req);

    if (!match.found) {
      return { ok: false, matcher: match };
    }

    return {
      ok: true,
      response: respond(req, match.ctx),
      matcher: match
    }
  }
}

/**
 * Composes a list of Matchers together into a single Matcher, using `mergeFn`
 * to merge the matcher results together
 */
function joinMatchersWith(
  matchers: Matcher[],
  mergeFn: (a: MatcherResult, b: MatcherResult) => MatcherResult
): Matcher {
  return async (req) => {
    const matches = await Promise.all(
      matchers.map(match => normalizePromise(match(req)))
    );
    return matches.reduce(mergeFn);
  }
}

/**
 * Creates a function that will merge two matcher results together using
 * `foundFn` for deriving the resulting `found` boolean
 */
function matchResultsMerger(
  foundFn: (a: boolean, b: boolean) => boolean
): (a: MatcherResult, b: MatcherResult) => MatcherResult  {
  return (a, b) => ({
    found: foundFn(a.found, b.found),
    children: (a.children ?? [a]).concat(b),
    ctx: { ...a.ctx, ...b.ctx }
  })
}

/**
 * Creates a new Matcher that is identical to the input Matcher except with the
 * modifications applied
 */
function modifyResult(
  modifier: (r: MatcherResult) => MatcherResult,
  matcher: Matcher,
): Matcher {
  return (req) => normalizePromise(matcher(req)).then(modifier)
}

/**
 * Creates a new Matcher that is identical to the input Matcher except with a
 * new name
 */
function renameResult(name: string, matcher: Matcher): Matcher {
  return modifyResult(r => ({ ...r, name }), matcher);
}

/**
 * Makes something a promise if it isn't already
 */
function normalizePromise<T>(v: PromiseOrNot<T>): Promise<T> {
  return (v instanceof Promise) ? v : Promise.resolve(v);
}