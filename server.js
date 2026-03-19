// Azure App Service entry point
console.log('Starting MCP server...');
import('./servers/google-search/dist/src/mcp-server.js').catch(err => {
  console.error('Failed to start MCP server:', err);
});
