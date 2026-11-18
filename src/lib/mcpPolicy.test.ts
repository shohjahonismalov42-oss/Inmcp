import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POLICY,
  isPrivateOrLocalHost,
  domainMatches,
  validateTargetUrl,
  validateBearerAuth,
} from './mcpPolicy';

test('isPrivateOrLocalHost blocks loopback, metadata, and RFC1918 addresses', () => {
  assert.equal(isPrivateOrLocalHost('localhost'), true);
  assert.equal(isPrivateOrLocalHost('127.0.0.1'), true);
  assert.equal(isPrivateOrLocalHost('169.254.169.254'), true);
  assert.equal(isPrivateOrLocalHost('10.0.0.5'), true);
  assert.equal(isPrivateOrLocalHost('172.16.4.1'), true);
  assert.equal(isPrivateOrLocalHost('192.168.1.10'), true);
  assert.equal(isPrivateOrLocalHost('::1'), true);
  assert.equal(isPrivateOrLocalHost('api.internal'), true);

  assert.equal(isPrivateOrLocalHost('example.com'), false);
  assert.equal(isPrivateOrLocalHost('172.32.0.1'), false);
  assert.equal(isPrivateOrLocalHost('8.8.8.8'), false);
});

test('domainMatches supports exact, subdomain, and wildcard patterns', () => {
  assert.equal(domainMatches('github.com', 'github.com'), true);
  assert.equal(domainMatches('api.github.com', 'github.com'), true);
  assert.equal(domainMatches('docs.anthropic.com', '*.anthropic.com'), true);
  assert.equal(domainMatches('evil-github.com', 'github.com'), false);
});

test('validateTargetUrl enforces protocol, SSRF, allowlist, blocklist, and HTTP methods', () => {
  const localCheck = validateTargetUrl('http://127.0.0.1:3000/api', DEFAULT_POLICY);
  assert.equal(localCheck.allowed, false);

  const fileCheck = validateTargetUrl('file:///etc/passwd', DEFAULT_POLICY);
  assert.equal(fileCheck.allowed, false);

  const allowlistPolicy = {
    ...DEFAULT_POLICY,
    mode: 'allowlist' as const,
    domains: ['github.com', 'example.com'],
  };
  assert.equal(validateTargetUrl('https://api.github.com/users', allowlistPolicy).allowed, true);
  assert.equal(validateTargetUrl('https://blocked.org/data', allowlistPolicy).allowed, false);

  const blocklistPolicy = {
    ...DEFAULT_POLICY,
    mode: 'blocklist' as const,
    domains: ['badsite.org'],
  };
  assert.equal(validateTargetUrl('https://sub.badsite.org/x', blocklistPolicy).allowed, false);
  assert.equal(validateTargetUrl('https://example.com', blocklistPolicy).allowed, true);

  assert.equal(
    validateTargetUrl('https://example.com', DEFAULT_POLICY, 'DELETE').allowed,
    false
  );
});

test('validateBearerAuth verifies token when requireBearerAuth is enabled', () => {
  const openPolicy = { ...DEFAULT_POLICY, requireBearerAuth: false };
  assert.equal(validateBearerAuth(undefined, openPolicy), true);

  const strictPolicy = {
    ...DEFAULT_POLICY,
    requireBearerAuth: true,
    bearerToken: 'secret-123',
  };
  assert.equal(validateBearerAuth(undefined, strictPolicy), false);
  assert.equal(validateBearerAuth('Bearer wrong', strictPolicy), false);
  assert.equal(validateBearerAuth('Bearer secret-123', strictPolicy), true);
});
