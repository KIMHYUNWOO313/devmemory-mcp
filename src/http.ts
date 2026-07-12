#!/usr/bin/env node
import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createDevMemoryServer, SERVER_NAME, SERVER_VERSION } from "./createServer.js";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = createMcpExpressApp({ host: HOST });

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: SERVER_NAME, version: SERVER_VERSION });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const server = createDevMemoryServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST /mcp" },
    id: null,
  });
});

app.listen(PORT, HOST, () => {
  console.log(`${SERVER_NAME} v${SERVER_VERSION} HTTP listening on http://${HOST}:${PORT}/mcp`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
