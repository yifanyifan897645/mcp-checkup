#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findConfigFiles, readConfigFile } from "./config-reader.js";
import { analyzeServer, findDuplicateTools, generateReport, ServerAnalysis } from "./analyzer.js";
import { countTokens } from "./token-counter.js";

const server = new McpServer({
  name: "mcp-health",
  version: "0.1.0",
});

// Tool 1: Scan all configured servers
server.tool(
  "analyze_servers",
  "Scan your MCP config and measure the token cost of every installed server. Returns tool count, total tokens, and a grade (A-F) per server.",
  {
    config_path: z
      .string()
      .optional()
      .describe("Path to MCP config file. Auto-detects if not provided."),
  },
  async ({ config_path }) => {
    let configs: Array<{ path: string; config: { mcpServers: Record<string, any> } }>;

    if (config_path) {
      configs = [{ path: config_path, config: readConfigFile(config_path) }];
    } else {
      configs = findConfigFiles();
    }

    if (configs.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "No MCP config files found. Checked .mcp.json, Claude Desktop config, and .cursor/mcp.json" }, null, 2),
        }],
      };
    }

    const allResults: Array<{ config_path: string; servers: ServerAnalysis[] }> = [];

    for (const { path, config } of configs) {
      const servers: ServerAnalysis[] = [];
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const analysis = await analyzeServer(name, serverConfig);
        servers.push(analysis);
      }
      allResults.push({ config_path: path, servers });
    }

    const summary = allResults.map((r) => ({
      config: r.config_path,
      servers: r.servers.map((s) => ({
        name: s.name,
        grade: s.grade,
        tools: s.toolCount,
        tokens: s.totalTokens,
        error: s.error || null,
      })),
      total_tokens: r.servers.reduce((sum, s) => sum + s.totalTokens, 0),
      total_tools: r.servers.reduce((sum, s) => sum + s.toolCount, 0),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
    };
  }
);

// Tool 2: Deep-dive a specific server
server.tool(
  "analyze_tools",
  "Get detailed token cost breakdown for each tool in a specific MCP server. Shows per-tool grades, bloated descriptions, and optimization suggestions.",
  {
    server_name: z.string().describe("Name of the MCP server (as it appears in your config)"),
    config_path: z
      .string()
      .optional()
      .describe("Path to MCP config file. Auto-detects if not provided."),
  },
  async ({ server_name, config_path }) => {
    let configs: Array<{ path: string; config: { mcpServers: Record<string, any> } }>;

    if (config_path) {
      configs = [{ path: config_path, config: readConfigFile(config_path) }];
    } else {
      configs = findConfigFiles();
    }

    for (const { config } of configs) {
      const serverConfig = config.mcpServers[server_name];
      if (serverConfig) {
        const analysis = await analyzeServer(server_name, serverConfig);
        return {
          content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
        };
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: `Server '${server_name}' not found in any config` }, null, 2),
      }],
    };
  }
);

// Tool 3: Find duplicate tools across servers
server.tool(
  "find_duplicates",
  "Scan all MCP servers for duplicate or overlapping tool names. Helps identify redundant servers eating your context window.",
  {
    config_path: z
      .string()
      .optional()
      .describe("Path to MCP config file. Auto-detects if not provided."),
  },
  async ({ config_path }) => {
    let configs: Array<{ path: string; config: { mcpServers: Record<string, any> } }>;

    if (config_path) {
      configs = [{ path: config_path, config: readConfigFile(config_path) }];
    } else {
      configs = findConfigFiles();
    }

    const allServers: ServerAnalysis[] = [];
    for (const { config } of configs) {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        const analysis = await analyzeServer(name, serverConfig);
        allServers.push(analysis);
      }
    }

    const duplicates = findDuplicateTools(allServers);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          duplicates,
          total_duplicate_tools: duplicates.length,
          recommendation: duplicates.length > 0
            ? "Consider removing redundant servers or using tool filtering to reduce context cost."
            : "No duplicate tools found across your servers.",
        }, null, 2),
      }],
    };
  }
);

// Tool 4: Count tokens in arbitrary text
server.tool(
  "count_tokens",
  "Count the number of tokens in a piece of text. Useful for estimating context window usage.",
  {
    text: z.string().describe("The text to count tokens for"),
  },
  async ({ text }) => {
    const tokens = countTokens(text);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ text_length: text.length, token_count: tokens }, null, 2),
      }],
    };
  }
);

// Tool 5: Generate full markdown report
server.tool(
  "generate_report",
  "Generate a comprehensive markdown health report for your MCP setup. Includes grades, token costs, duplicates, and optimization recommendations.",
  {
    config_path: z
      .string()
      .optional()
      .describe("Path to MCP config file. Auto-detects if not provided."),
  },
  async ({ config_path }) => {
    let configs: Array<{ path: string; config: { mcpServers: Record<string, any> } }>;

    if (config_path) {
      configs = [{ path: config_path, config: readConfigFile(config_path) }];
    } else {
      configs = findConfigFiles();
    }

    if (configs.length === 0) {
      return {
        content: [{
          type: "text",
          text: "No MCP config files found.",
        }],
      };
    }

    const { path, config } = configs[0];
    const servers: ServerAnalysis[] = [];
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      const analysis = await analyzeServer(name, serverConfig);
      servers.push(analysis);
    }

    const report = generateReport(servers, path);

    return {
      content: [{ type: "text", text: report }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
