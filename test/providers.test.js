/**
 * Regression guard for the provider guard: DSH 0.2.2 ships the official route as
 * `deepseek-official`, while the bundle patch historically listed only the older
 * `deepseek-account`. A stale list must not hide the header chip.
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

test('accepts the legacy account alias', () => {
  assert.ok(officialProvidersOf({}).includes('deepseek-account'));
});

test('adds configured providers once, after the built-in ids', () => {
  assert.deepEqual(officialProvidersOf({ officialProviders: ['my-proxy', 'deepseek-official', 'my-proxy'] }), [
    'deepseek-official',
    'deepseek-account',
    'my-proxy',
  ]);
});
