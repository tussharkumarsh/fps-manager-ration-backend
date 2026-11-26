import test from 'node:test';
import assert from 'node:assert/strict';

import { isLockedOut, lockoutKey, MAX_FAILED_ATTEMPTS, LOCKOUT_WINDOW_MS } from '../src/lib/loginLimit';

const now = new Date('2026-11-26T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);
const failures = (count: number, ageMinutes: number) => Array.from({ length: count }, () => minutesAgo(ageMinutes));

test('limits are 10 failures per 15 minutes', () => {
    assert.equal(MAX_FAILED_ATTEMPTS, 10);
    assert.equal(LOCKOUT_WINDOW_MS, 15 * 60 * 1000);
});

test('9 recent failures do not lock out', () => {
    assert.equal(isLockedOut(failures(9, 1), now), false);
});

test('10 recent failures lock out', () => {
    assert.equal(isLockedOut(failures(10, 1), now), true);
});

test('failures older than the window do not count', () => {
    assert.equal(isLockedOut(failures(10, 16), now), false);
    assert.equal(isLockedOut([...failures(9, 16), ...failures(9, 2)], now), false);
});

test('lockoutKey scopes failures to the account and the client IP', () => {
    // fps_id and username for the same account share one counter...
    assert.equal(lockoutKey('151209500212', '203.0.113.5'), lockoutKey('151209500212', '203.0.113.5'));
    // ...but an attacker on another IP does not lock the dealer out.
    assert.notEqual(lockoutKey('151209500212', '198.51.100.9'), lockoutKey('151209500212', '203.0.113.5'));
    assert.equal(lockoutKey(' ABC ', undefined), 'abc|-');
});
