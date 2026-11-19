import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import {
  clearAuditLogs,
  getAuditLogs,
  getDownloadedFile,
  getPolicy,
  handleMcpJsonRpc,
  updatePolicy,
} from './src/server/mcpExecutor';
import { validateBearerAuth, validateTargetUrl } from './src/lib/mcpPolicy';
import {
  JsonRpcRequest,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOOLS,
  buildJsonRpcError,
  generateStandaloneMcpScript,
} from './src/lib/mcpProtocol';
import {
  deleteKv,
  deleteRecord,
  getDbStats,
  insertRecord,
  listAiRuns,
  listKv,
  queryRecords,
  upsertKv,
} from './src/server/mcpDatabase';
import {
  getProviderReadiness,
  runMultiAiTask,
  verifyAllProviders,
} from './src/server/multiAiExecutor';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Active SSE transport sessions for legacy MCP clients
const sseClients = new Map<string, Response>();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // CORS for remote MCP clients and Claude connectors
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Mcp-Session-Id, Accept'
    );
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // 1. Streamable HTTP MCP Endpoint (/mcp) — Spec 2025-03-26
  // ---------------------------------------------------------------------------
  app.post('/mcp', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const policy = getPolicy();

    if (!validateBearerAuth(authHeader, policy)) {
      return res
        .status(401)
        .json(
          buildJsonRpcError(
            null,
            -32001,
            'Unauthorized: Bearer token talab qilinadi.'
          )
        );
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res
        .status(400)
        .json(buildJsonRpcError(null, -32700, 'Parse error: JSON body kutilmoqda.'));
    }

    // Handle JSON-RPC batch or single message
    if (Array.isArray(payload)) {
      const responses = await Promise.all(
        payload.map((item) => handleMcpJsonRpc(item as JsonRpcRequest, authHeader))
      );
      const filtered = responses.filter(Boolean);
      if (filtered.length === 0) return res.sendStatus(202);
      return res.json(filtered);
    }

    const rpcReq = payload as JsonRpcRequest;
    if (rpcReq.method === 'initialize') {
      const sessionId =
        (req.headers['mcp-session-id'] as string) || crypto.randomUUID();
      res.setHeader('Mcp-Session-Id', sessionId);
    }

    const response = await handleMcpJsonRpc(rpcReq, authHeader);
    if (!response) {
      return res.sendStatus(202);
    }
    return res.json(response);
  });

  app.get('/mcp', (req: Request, res: Response) => {
    const accept = String(req.headers.accept || '');
    if (accept.includes('text/event-stream') && !accept.includes('application/json')) {
      return res.status(405).set('Allow', 'POST, DELETE').end();
    }
    res.json({
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      transport: ['streamable-http', 'sse'],
      tools: MCP_TOOLS.map((t) => t.name),
      status: 'ready',
    });
  });

  app.delete('/mcp', (_req: Request, res: Response) => {
    res.sendStatus(204);
  });

  // ---------------------------------------------------------------------------
  // 2. Legacy SSE MCP Transport (/sse + /messages) — Spec 2024-11-05
  // ---------------------------------------------------------------------------
  app.get('/sse', (req: Request, res: Response) => {
    const policy = getPolicy();
    if (!validateBearerAuth(req.headers.authorization, policy)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sessionId = crypto.randomUUID();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    sseClients.set(sessionId, res);
    res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 20_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(sessionId);
    });
  });

  app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = String(req.query.sessionId || '');
    const client = sseClients.get(sessionId);
    const authHeader = req.headers.authorization;
    const rpcReq = req.body as JsonRpcRequest;

    const response = await handleMcpJsonRpc(rpcReq, authHeader);
    if (client && !client.writableEnded && response) {
      client.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }

    if (!response) {
      return res.sendStatus(202);
    }
    return res.status(202).json(response);
  });

  // ---------------------------------------------------------------------------
  // 3. Developer Console Management API (/api/*)
  // ---------------------------------------------------------------------------
  app.get('/api/status', (_req: Request, res: Response) => {
    const policy = getPolicy();
    const logs = getAuditLogs();
    res.json({
      serverName: MCP_SERVER_NAME,
      serverVersion: MCP_SERVER_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      toolCount: MCP_TOOLS.length,
      tools: MCP_TOOLS,
      policy,
      stats: {
        totalCalls: logs.length,
        okCalls: logs.filter((l) => l.status === 'ok').length,
        blockedCalls: logs.filter((l) => l.status === 'blocked').length,
        errorCalls: logs.filter((l) => l.status === 'error').length,
      },
    });
  });

  app.get('/api/policy', (_req: Request, res: Response) => {
    res.json(getPolicy());
  });

  app.put('/api/policy', (req: Request, res: Response) => {
    const updated = updatePolicy(req.body || {});
    res.json(updated);
  });

  app.post('/api/policy/check', (req: Request, res: Response) => {
    const { url, method } = (req.body || {}) as { url?: string; method?: string };
    const result = validateTargetUrl(String(url || ''), getPolicy(), method || 'GET');
    res.json({
      allowed: result.allowed,
      reason: result.reason || 'Ruxsat etilgan: URL joriy sandbox siyosatiga mos.',
      hostname: result.parsedUrl?.hostname || null,
    });
  });

  app.get('/api/logs', (_req: Request, res: Response) => {
    res.json({ logs: getAuditLogs() });
  });

  app.delete('/api/logs', (_req: Request, res: Response) => {
    clearAuditLogs();
    res.json({ cleared: true });
  });

  app.get('/api/downloads/:id/:filename?', (req: Request, res: Response) => {
    const item = getDownloadedFile(String(req.params.id || ''));
    if (!item) {
      return res.status(404).json({ error: 'Yuklab olingan fayl topilmadi yoki muddati tugagan.' });
    }
    res.setHeader('Content-Type', item.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${item.filename.replace(/"/g, '')}"`
    );
    res.setHeader('Content-Length', String(item.buffer.byteLength));
    res.send(item.buffer);
  });

  app.get('/api/download/mcp-web-bridge.mjs', (_req: Request, res: Response) => {
    const policy = getPolicy();
    const script = generateStandaloneMcpScript({
      timeoutMs: policy.timeoutMs,
      maxResponseBytes: policy.maxResponseBytes,
      blockPrivateNetworks: policy.blockPrivateNetworks,
    });
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="mcp-web-bridge.mjs"'
    );
    res.send(script);
  });

  // ---------------------------------------------------------------------------
  // 3b. Multi-AI Status & SQLite Persistence Console API
  // ---------------------------------------------------------------------------
  app.get('/api/ai/status', (_req: Request, res: Response) => {
    res.json({
      providers: getProviderReadiness(),
      runs: listAiRuns(30),
    });
  });

  app.post('/api/ai/verify', async (_req: Request, res: Response) => {
    try {
      const checks = await verifyAllProviders();
      res.json({ checks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/ai/delegate', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const result = await runMultiAiTask({
        task: String(body.task || ''),
        difficulty: (body.difficulty as 'auto' | 'easy' | 'medium' | 'hard') || 'auto',
        provider: (body.provider as 'auto' | 'groq' | 'gemini' | 'openrouter') || 'auto',
        context: typeof body.context === 'string' ? body.context : undefined,
        systemInstruction:
          typeof body.systemInstruction === 'string' ? body.systemInstruction : undefined,
        jsonMode: Boolean(body.jsonMode),
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/db', (req: Request, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const collection =
      typeof req.query.collection === 'string' ? req.query.collection : undefined;
    const namespace =
      typeof req.query.namespace === 'string' ? req.query.namespace : undefined;
    res.json({
      stats: getDbStats(),
      kv: listKv(namespace, search, 80),
      records: queryRecords(collection, search, 80),
      runs: listAiRuns(40),
    });
  });

  app.post('/api/db/kv', (req: Request, res: Response) => {
    try {
      const { namespace, key, value } = (req.body || {}) as {
        namespace?: string;
        key?: string;
        value?: unknown;
      };
      const item = upsertKv(String(namespace || 'default'), String(key || ''), value ?? '');
      res.json({ item });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/db/kv', (req: Request, res: Response) => {
    const namespace = String(req.query.namespace || 'default');
    const key = String(req.query.key || '');
    const deleted = deleteKv(namespace, key);
    res.json({ deleted });
  });

  app.post('/api/db/records', (req: Request, res: Response) => {
    try {
      const { collection, title, data, tags } = (req.body || {}) as {
        collection?: string;
        title?: string;
        data?: unknown;
        tags?: string;
      };
      const item = insertRecord(
        String(collection || 'notes'),
        String(title || ''),
        data ?? '',
        String(tags || '')
      );
      res.json({ item });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/db/records/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Noto‘g‘ri ID' });
    }
    const deleted = deleteRecord(id);
    res.json({ deleted });
  });

  // ---------------------------------------------------------------------------
  // 4. Vite Middleware (Dev) or Static Assets (Prod)
  // ---------------------------------------------------------------------------
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = fs.existsSync(path.resolve(__dirname, 'index.html'))
      ? __dirname
      : path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MCP Web Bridge listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
