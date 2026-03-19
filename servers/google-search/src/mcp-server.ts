#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";
import { z } from "zod";
import { googleSearch, getGoogleSearchPageHtml, fetchWebpage, formatWebSearchResults } from "./search.js";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import logger from "./logger.js";
import { chromium, Browser } from "playwright";

// Global browser instance
let globalBrowser: Browser | undefined = undefined;

// Create MCP server instance
const server = new McpServer({
  name: "google-search-server",
  version: "1.0.0",
});

// Register Google search tool
server.tool(
  "google-search",
  "Use Google search engine to query real-time web information. Returns search results including title, link and snippet. Suitable for getting latest information, finding specific topic materials, researching current events or verifying facts.",
  {
    query: z
      .string()
      .describe(
        "Search query string. For best results: 1) Use English keywords as they are typically more comprehensive and up-to-date, especially in technical and academic fields; 2) Use specific keywords rather than vague phrases; 3) Use quotes \"exact phrase\" for exact match; 4) Use site:domain to limit to specific websites; 5) Use -exclude to filter results; 6) Use OR to connect alternatives; 7) Prefer professional terminology; 8) Keep to 2-5 keywords for balanced results; 9) Choose appropriate language based on target content (e.g., Chinese when looking for specific Chinese resources). Example: 'climate change report 2024 site:gov -opinion' or '\"machine learning algorithms\" tutorial (Python OR Julia)'"
      ),
    limit: z
      .number()
      .optional()
      .describe("Number of search results to return (default: 10, recommended range: 1-20)"),
    timeout: z
      .number()
      .optional()
      .describe("Search operation timeout in milliseconds (default: 30000, can adjust based on network conditions)"),
  },
  async (params) => {
    try {
      const { query, limit, timeout } = params;
      logger.info({ query }, "Executing Google search");

      // Get state file path from user home directory
      const stateFilePath = path.join(
        os.homedir(),
        ".google-search-browser-state.json"
      );
      logger.info({ stateFilePath }, "Using state file path");

      // Check if state file exists
      const stateFileExists = fs.existsSync(stateFilePath);

      // Initialize warning message
      let warningMessage = "";

      if (!stateFileExists) {
        warningMessage =
          "Warning: Browser state file does not exist. On first use, if you encounter CAPTCHA, the system will automatically switch to headed mode to let you complete verification. After completion, the state file will be saved for smoother future searches.";
        logger.warn(warningMessage);
      }

      // Execute search using global browser instance
      const results = await googleSearch(
        query,
        {
          limit: limit,
          timeout: timeout,
          stateFile: stateFilePath,
        },
        globalBrowser
      );

      // Build response with warning message
      let responseText = JSON.stringify(results, null, 2);
      if (warningMessage) {
        responseText = warningMessage + "\n\n" + responseText;
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      logger.error({ error }, "Search tool execution error");

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Search failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Register web_search tool (SEO optimized version)
server.tool(
  "web_search",
  "Search the web to retrieve relevant pages for a given query. Use this tool when performing SERP research or when real web information is required. Returns search results with rank position, title, URL, and snippet.",
  {
    query: z
      .string()
      .describe("The search query string. For best results: 1) Use specific keywords rather than vague phrases; 2) Use 2-5 keywords for balanced results; 3) Use English keywords for better coverage in technical/educational content."),
    num_results: z
      .number()
      .optional()
      .describe("Number of search results to return (default: 10, recommended range: 1-20)")
  },
  async (params) => {
    try {
      const { query, num_results = 10 } = params;
      logger.info({ query, num_results }, "Executing web search (SEO optimized)");

      // Get state file path from user home directory
      const stateFilePath = path.join(
        os.homedir(),
        ".google-search-browser-state.json"
      );

      // Execute search
      const results = await googleSearch(
        query,
        {
          limit: num_results,
          timeout: 30000,
          stateFile: stateFilePath,
        },
        globalBrowser
      );

      // Format results with ranking
      const webResults = formatWebSearchResults(results.results, num_results);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(webResults, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error({ error }, "web_search tool execution error");

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Search failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }
);

// Register fetch_webpage tool
server.tool(
  "fetch_webpage",
  "Retrieve the content and headings of a webpage. Use this tool after identifying relevant URLs from web search results. Returns page title, structured headings (H1, H2, H3), and cleaned content text.",
  {
    url: z
      .string()
      .describe("The URL of the webpage to fetch")
  },
  async (params) => {
    try {
      const { url } = params;
      logger.info({ url }, "Fetching webpage content...");

      // Fetch webpage content
      const pageContent = await fetchWebpage(url, globalBrowser);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(pageContent, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error({ error }, "fetch_webpage tool execution error");

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Unable to retrieve webpage",
              message: error instanceof Error ? error.message : String(error)
            }),
          },
        ],
      };
    }
  }
);

// Start server
async function main() {
  try {
    // Determine transport mode from environment
    const transportMode = process.env.MCP_TRANSPORT || "sse";
    const port = parseInt(process.env.PORT || process.env.MCP_PORT || "8080", 10);
    const host = process.env.MCP_HOST || "0.0.0.0";

    logger.info({ transportMode, port, host }, "Starting Google Search MCP server...");

    // Initialize global browser instance
    logger.info("Initializing global browser instance...");
    globalBrowser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
        "--disable-web-security",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--hide-scrollbars",
        "--mute-audio",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-component-extensions-with-background-pages",
        "--disable-extensions",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--disable-renderer-backgrounding",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        "--force-color-profile=srgb",
        "--metrics-recording-only",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });
    logger.info("Global browser instance initialized successfully");

    if (transportMode === "sse") {
      // HTTP/SSE transport for cloud deployment using StreamableHTTP
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });

      await server.connect(transport);

      const httpServer = http.createServer(async (req, res) => {
        if (req.url === "/mcp" || req.url?.startsWith("/mcp")) {
          await transport.handleRequest(req, res);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });

      httpServer.listen(port, host, () => {
        logger.info(`Google Search MCP server started on ${host}:${port} with SSE transport`);
      });
    } else {
      // Default stdio transport for local development
      const transport = new StdioServerTransport();
      await server.connect(transport);
      logger.info("Google Search MCP server started with stdio transport");
    }

    // Set up cleanup on process exit
    process.on("exit", async () => {
      await cleanupBrowser();
    });

    // Handle Ctrl+C (Windows and Unix/Linux)
    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down server...");
      await cleanupBrowser();
      process.exit(0);
    });

    // Handle process termination (Unix/Linux)
    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down server...");
      await cleanupBrowser();
      process.exit(0);
    });

    // Windows specific handling
    if (process.platform === "win32") {
      // Handle Windows CTRL_CLOSE_EVENT, CTRL_LOGOFF_EVENT and CTRL_SHUTDOWN_EVENT
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.on("SIGINT", async () => {
        logger.info("Windows: Received SIGINT, shutting down server...");
        await cleanupBrowser();
        process.exit(0);
      });
    }
  } catch (error) {
    logger.error({ error }, "Server startup failed");
    await cleanupBrowser();
    process.exit(1);
  }
}

// Cleanup browser resources
async function cleanupBrowser() {
  if (globalBrowser) {
    logger.info("Closing global browser instance...");
    try {
      await globalBrowser.close();
      globalBrowser = undefined;
      logger.info("Global browser instance closed");
    } catch (error) {
      logger.error({ error }, "Error closing browser instance");
    }
  }
}

main();
