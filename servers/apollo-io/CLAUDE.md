# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apollo.io MCP Server - A Model Context Protocol server providing AI assistants access to Apollo.io API for people and organization enrichment, search, and job postings.

## Build & Development Commands

```bash
# Install dependencies
uv sync

# Run stdio MCP server (for local development with Claude Desktop)
uv run python server.py

# Run HTTP server (for Docker deployment)
uv run python server_http.py

# Or with uvicorn
uvicorn server_http:app --host 0.0.0.0 --port 8080
```

## Architecture

### Dual Deployment Modes

**Stdio Server** (`server.py`): Uses stdio transport for embedded integration with Claude Desktop. API key loaded from environment or `.env` file.

**HTTP Server** (`server_http.py`): FastAPI server with MCP JSON-RPC handling. API key passed via HTTP header `X-Apollo-Api-Key` for multi-tenant support.

### File Structure

```
servers/apollo-io/
├── server.py           # Stdio MCP server (local dev)
├── server_http.py      # HTTP MCP server (production/Docker)
├── apollo_client.py    # Apollo.io API client
├── apollo/             # Data models for Apollo.io API
│   ├── __init__.py
│   ├── people.py
│   ├── people_search.py
│   ├── organization.py
│   ├── organization_search.py
│   └── organization_job_postings.py
├── pyproject.toml      # Python dependencies
├── Dockerfile          # Docker image
└── env.example         # Environment variables template
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `people_enrichment` | Enrich data for 1 person |
| `organization_enrichment` | Enrich data for 1 company |
| `people_search` | Find people by criteria |
| `organization_search` | Find organizations by criteria |
| `organization_job_postings` | Get job postings for an organization |

## Configuration

### Stdio Mode (local dev)
- `APOLLO_IO_API_KEY` - Your Apollo.io API key (set in `.env`)

### HTTP Mode (Docker/production)
- API key passed via header: `X-Apollo-Api-Key`
- Each request can have a different API key (multi-tenant)

## Docker Deployment

```bash
# Build and run
docker build -t apollo-io-mcp .
docker run -p 8080:8080 apollo-io-mcp

# Or use docker-compose
docker compose up apollo-io
```

## API Key

Get your API key from https://www.apollo.io/api
