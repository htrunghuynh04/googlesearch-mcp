# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Azure DevOps MCP Server - A Model Context Protocol server providing AI assistants access to Azure DevOps through standardized protocol. Supports work items, repositories, boards, sprints, testing, DevSecOps, and artifact management.

## Build & Development Commands

```bash
npm run build              # Compile TypeScript to dist/
npm run build:ignore-errors # Build skipping TS errors (for CI/CD)
npm start                  # Run stdio MCP server (for Cursor/Claude Desktop)
npm run start:remote       # Run Express HTTP server on port 8080
npm run dev                # Dev mode with ts-node (stdio)
npm run dev:remote         # Dev mode with ts-node (HTTP server)
```

## Architecture

### Dual Deployment Modes

**Stdio Server** (`src/index.ts`): Uses `StdioServerTransport` for embedded integration with Cursor/Claude Desktop. Configuration via environment variables.

**Remote Server** (`src/remote-server.ts`): Express.js server using SSE + StreamableHTTP transports. Configuration via HTTP headers for per-request dynamic config. Enables multi-tenant support.

### Layered Structure

```
MCP Server (index.ts / remote-server.ts)
    ↓
Tools Layer (src/Tools/) - MCP tool wrappers returning standardized McpResponse
    ↓
Services Layer (src/Services/) - Azure DevOps API interactions, auth handling
    ↓
Interfaces Layer (src/Interfaces/) - TypeScript types and Zod schemas
```

### Tool Registration Pattern

Tools are conditionally registered based on `ALLOWED_TOOLS` environment variable:
```typescript
allowedTools.has('listWorkItems') &&
  server.tool('listWorkItems', 'description', { query: z.string() }, async (params) => { ... });
```

Each tool class exports a static `ToolMethods` array used for registration.

### Authentication

- **Cloud**: PAT tokens or Entra ID (uses `DefaultAzureCredential`)
- **On-premises**: PAT, NTLM, or Basic auth
- `EntraAuthHandler` is singleton with automatic token refresh (60-second buffer)

### Response Format

All tools return via `formatMcpResponse()`:
```typescript
{ content: [{ type: "text", text: "..." }], rawData: <data>, isError: boolean }
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Stdio server entry, tool registration (~1900 lines) |
| `src/remote-server.ts` | Express HTTP server with middleware pipeline |
| `src/config.ts` | Configuration loading, tool filtering |
| `src/Services/*.ts` | Azure DevOps API logic per domain |
| `src/Tools/*.ts` | MCP tool wrappers per domain |
| `src/Interfaces/Common.ts` | `McpResponse`, `formatMcpResponse()`, `formatErrorResponse()` |

## Remote Server Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mcp` | POST | Main MCP protocol (SSE/HTTP streaming) |
| `/health` | GET | Health check |
| `/config` or `/` | GET | Configuration guide |

## Configuration

**Environment Variables** (stdio mode):
- `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN`
- `AZURE_DEVOPS_AUTH_TYPE` (pat|ntlm|basic|entra)
- `ALLOWED_TOOLS` - comma-separated tool method names

**HTTP Headers** (remote mode):
- `x-azure-devops-org-url`, `x-azure-devops-project`, `x-azure-devops-pat`
- `x-azure-devops-auth-type`, `x-azure-devops-allowed-tools`

## Tool Categories

8 categories with ~97 methods: Work Items, Boards/Sprints, Projects, Git/Code, Testing, DevSecOps, Artifact Management, AI-Assisted Development.

## Docker Deployment

```bash
docker build -t azuredevops-mcp .
docker-compose up -d  # Exposes port 8080, health check on /health
```
