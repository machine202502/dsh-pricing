/**
 * Regression guard for the provider guard: DSH ships new sessions on
 * `deepseek-official`, while the bundle patch listed only `deepseek-account`, the
 * route that serves the signed-in account. A config naming one of them must not
 * hide the header chip.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { officialProvidersOf } from '../index.js';

test('always accepts the route DSH ships', () => {
  assert.deepEqual(officialProvidersOf({ officialProviders: ['deepseek-account'] }), [
    'deepseek-official',
    'deepseek-account',
  ]);
});

test('accepts the account route', () => {
  assert.ok(officialProvidersOf({}).includes('deepseek-account'));
});

test('adds configured providers once, after the built-in ids', () => {
  assert.deepEqual(officialProvidersOf({ officialProviders: ['my-proxy', 'deepseek-official', 'my-proxy'] }), [
    'deepseek-official',
    'deepseek-account',
    'my-proxy',
  ]);
});
