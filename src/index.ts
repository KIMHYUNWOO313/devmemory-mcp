#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDevMemoryServer, SERVER_NAME, SERVER_VERSION } from "./createServer.js";

async function main() {
  const server = createDevMemoryServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
