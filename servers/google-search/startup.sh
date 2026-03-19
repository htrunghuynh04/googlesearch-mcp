#!/bin/bash
cd /home/site/wwwroot
export PORT=8080
export MCP_TRANSPORT=sse
node dist/src/mcp-server.js
