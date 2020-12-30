import { Request, Response } from 'express';
import { match as createPathMatch } from 'path-to-regexp';
import deepmerge from 'deepmerge'; 

/**
 * Creates an evaluator function for the rule that can be used for checking if
 * it matches and generating the mocked response
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
      response: respond(req, match.ctx ?? {}),
      matcher: match
    }
  }
}

//-----------------------------------------------------------------------------
// Types
//-----------------------------------------------------------------------------

export interface MockRule {
  match: Matcher | Matcher[];
  respond: (res: Request, ctx: Record<string, any>) => object;
}

type PromiseOrNot<T> = Promise<T> | T;

export interface MatcherResult {
  found: boolean;
  name?: string;
  children?: MatcherResult[];
  ctx?: Record<string, any>
}

export type RuleResult = 
  | { ok: true, matcher: MatcherResult, response: object }
  | { ok: false, matcher: MatcherResult };

export interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: object;
}

export type Matcher = (r: Request) => PromiseOrNot<MatcherResult>
export type RuleEvaluator = (r: Request) => Promise<RuleResult>;
export type Responder = (
  (req: Request, res: Response, ctx: Record<string, any>) => PromiseOrNot<MockResponse>
)

//-----------------------------------------------------------------------------
// Matcher factories
//-----------------------------------------------------------------------------

export function path(url: string): Matcher {
  const matchPath = createPathMatch(url);
  return ({ path }) => {
    const matched = matchPath(path);
    const params = (matched) ? matched.params : {};
    const found = (matched !== false);
    return {
      found,
      name: `url[${url}]`,
      ctx: {
        path,
        params,
      }
    };
  };
}

/**
 * Matches if the request method matches
 */
export function method(verb: string): Matcher {
  return ({ method }) => ({
    found: method === verb.toUpperCase(),
    name: `method[${verb}]`,
    ctx: { method }
  })
}

/**
 * Matches if the body predicate is found
 */
export function body(predicate: (body: any) => boolean): Matcher {
  return (req) => ({
      found: predicate(req.body),
      name: `body`,
  })
}

/**
 * Shorthand for matching on both the method and path
 */
export function request(verb: string, url: string): Matcher {
  const matcher = allOf([method(verb), path(url)]);
  return renameResult('request', matcher);
}

/**
 * Matches if the request contains the header, and optionally if its value
 * matches
 */
export function header(key: string, value?: string): Matcher {
  return (req) => {
    const headerValue = req.headers[key.toLowerCase()]
    // If we have a `value` then try to match on both presence and value,
    // otherwise just match on presence
    const found = (value !== undefined)
      ? !!headerValue && headerValue === value
      : !!headerValue;
    const ctx = (found)
      ? { headers: { [key.toLowerCase()]: headerValue } }
      : undefined;

    return {
      found,
      ctx,
      name: `header[${key}:${value}]`
    };
  };
}

/**
 * Matches if at least one of the child matchers is found
 */
export function anyOf(matchers: Matcher[]): Matcher {
  const merger = matchResultsMerger((a, b) => a || b);
  const matcher = joinMatchersWith(matchers, merger)
  return renameResult('anyOf', matcher);
}

/**
 * Matches if all of the child matchers are found
 */
export function allOf(matchers: Matcher[]): Matcher {
  const merger = matchResultsMerger((a, b) => a && b);
  const matcher = joinMatchersWith(matchers, merger);
  return renameResult('allOf', matcher);
}

/**
 * Matches if the child matcher doesn't match
 */
export function not(matcher: Matcher): Matcher {
  return async (req) => {
    const result = await normalizePromise(matcher(req));
    return {
      found: !result.found,
      name: 'not',
      children: [result]
    }
  };
}

//-----------------------------------------------------------------------------
// Matcher utilities
//-----------------------------------------------------------------------------

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
    return {
      ...matches.reduce(mergeFn),
      children: matches
    };
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
    ctx: deepmerge((a.ctx ?? {}), (b.ctx ?? {}))
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