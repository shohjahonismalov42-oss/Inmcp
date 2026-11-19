import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MCP_TOOLS,
  generateClientConfig,
  generateStandaloneMcpScript,
  buildJsonRpcSuccess,
  buildJsonRpcError,
} from './mcpProtocol';

test('MCP_TOOLS defines all 13 tools with valid input schemas', () => {
  const names = MCP_TOOLS.map((t) => t.name);
  assert.deepEqual(names, [
    'web_search',
    'web_fetch',
    'http_request',
    'extract_links',
    'check_url_health',
    'download_file',
    'tts_generate',
    'stt_transcribe',
    'db_save',
    'db_get',
    'db_delete',
    'db_sql',
    'ai_delegate',
  ]);
  for (const tool of MCP_TOOLS) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(Array.isArray(tool.inputSchema.required));
  }
});

test('generateClientConfig produces valid JSON for Claude Desktop and Sandbox Bridge', () => {
  const desktop = generateClientConfig('claude_desktop', {
    endpointUrl: 'https://gateway.example.com/mcp',
    sseUrl: 'https://gateway.example.com/sse',
    requireAuth: true,
    bearerToken: 'tok_abc',
  });
  const parsedDesktop = JSON.parse(desktop.content);
  assert.ok(parsedDesktop.mcpServers['web-bridge-remote']);
  assert.ok(parsedDesktop.mcpServers['web-bridge-remote'].args.includes('--header'));

  const bridge = generateClientConfig('sandbox_bridge', {
    endpointUrl: 'https://gateway.example.com/mcp',
    sseUrl: 'https://gateway.example.com/sse',
    requireAuth: false,
  });
  const parsedBridge = JSON.parse(bridge.content);
  assert.equal(
    parsedBridge.mcpServers['sandbox-internet-gateway'].url,
    'https://gateway.example.com/mcp'
  );
});

test('generateStandaloneMcpScript embeds configured policy limits', () => {
  const script = generateStandaloneMcpScript({
    timeoutMs: 9000,
    maxResponseBytes: 256000,
    blockPrivateNetworks: true,
  });
  assert.equal(script.includes('9000'), true);
  assert.equal(script.includes('256000'), true);
  assert.equal(script.includes("req.method === 'tools/call'"), true);
});

test('JSON-RPC builders return standard 2.0 envelopes', () => {
  const ok = buildJsonRpcSuccess(1, { ok: true });
  assert.deepEqual(ok, { jsonrpc: '2.0', id: 1, result: { ok: true } });

  const err = buildJsonRpcError(2, -32601, 'Not found');
  assert.deepEqual(err, {
    jsonrpc: '2.0',
    id: 2,
    error: { code: -32601, message: 'Not found' },
  });
});
