import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpServerConfig } from "./config-reader.js";
import { createHash } from "node:crypto";
import { analyzeToolTokens, ToolTokenAnalysis } from "./token-counter.js";

export interface ServerAnalysis {
  name: string;
  command: string;
  toolCount: number;
  totalTokens: number;
  tools: ToolTokenAnalysis[];
  grade: "A" | "B" | "C" | "D" | "F";
  error?: string;
}

export async function analyzeServer(
  name: string,
  config: McpServerConfig,
  timeoutMs = 15000
): Promise<ServerAnalysis> {
  const result: ServerAnalysis = {
    name,
    command: `${config.command} ${(config.args || []).join(" ")}`.trim(),
    toolCount: 0,
    totalTokens: 0,
    tools: [],
    grade: "A",
  };

  try {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
    });

    const client = new Client({
      name: "mcp-health-analyzer",
      version: "0.1.0",
    });

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), timeoutMs)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    // List tools
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];

    result.toolCount = tools.length;

    for (const tool of tools) {
      const analysis = analyzeToolTokens({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      });
      result.tools.push(analysis);
      result.totalTokens += analysis.totalTokens;
    }

    // Sort by token cost descending
    result.tools.sort((a, b) => b.totalTokens - a.totalTokens);

    // Grade the server
    if (result.totalTokens <= 500) result.grade = "A";
    else if (result.totalTokens <= 1500) result.grade = "B";
    else if (result.totalTokens <= 3000) result.grade = "C";
    else if (result.totalTokens <= 6000) result.grade = "D";
    else result.grade = "F";

    // Clean up
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = `Failed to connect: ${message}`;
  }

  return result;
}

export function findDuplicateTools(
  servers: ServerAnalysis[]
): Array<{ toolName: string; servers: string[] }> {
  const toolMap = new Map<string, string[]>();

  for (const server of servers) {
    for (const tool of server.tools) {
      const existing = toolMap.get(tool.name);
      if (existing) {
        existing.push(server.name);
      } else {
        toolMap.set(tool.name, [server.name]);
      }
    }
  }

  return Array.from(toolMap.entries())
    .filter(([, servers]) => servers.length > 1)
    .map(([toolName, servers]) => ({ toolName, servers }));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tokenBucket(tokens: number): string {
  if (tokens <= 500) return "0-500";
  if (tokens <= 1500) return "501-1500";
  if (tokens <= 3000) return "1501-3000";
  if (tokens <= 6000) return "3001-6000";
  if (tokens <= 12000) return "6001-12000";
  return "12000+";
}

export interface ContextSelectionReceipt {
  receipt_type: "mcp.context.selection.evaluated";
  receipt_version: "0.1";
  privacy: {
    raw_tool_schemas_included: false;
    raw_tool_descriptions_included: false;
    raw_config_path_included: false;
    raw_commands_or_env_included: false;
  };
  config_path_hash: string;
  candidate_server_count: number;
  candidate_tool_count: number;
  selected_server_count: number;
  selected_tool_count: number;
  suppressed_server_count: number;
  suppressed_tool_count: number;
  delivered_hash_count: number;
  duplicate_tool_name_count: number;
  total_token_bucket: string;
  servers: Array<{
    server_hash: string;
    grade: ServerAnalysis["grade"];
    tool_count: number;
    token_bucket: string;
    highest_cost_tool_hashes: string[];
    error: boolean;
  }>;
}

export function generateContextSelectionReceipt(
  servers: ServerAnalysis[],
  configPath: string
): ContextSelectionReceipt {
  const duplicates = findDuplicateTools(servers);
  const analyzedServers = servers.filter((server) => !server.error);
  const totalTokens = analyzedServers.reduce((sum, server) => sum + server.totalTokens, 0);
  const selectedToolCount = analyzedServers.reduce((sum, server) => sum + server.toolCount, 0);
  const erroredServers = servers.filter((server) => Boolean(server.error));
  const suppressedToolCount = erroredServers.reduce((sum, server) => sum + server.toolCount, 0);

  return {
    receipt_type: "mcp.context.selection.evaluated",
    receipt_version: "0.1",
    privacy: {
      raw_tool_schemas_included: false,
      raw_tool_descriptions_included: false,
      raw_config_path_included: false,
      raw_commands_or_env_included: false,
    },
    config_path_hash: sha256(configPath),
    candidate_server_count: servers.length,
    candidate_tool_count: selectedToolCount + suppressedToolCount,
    selected_server_count: analyzedServers.length,
    selected_tool_count: selectedToolCount,
    suppressed_server_count: erroredServers.length,
    suppressed_tool_count: suppressedToolCount,
    delivered_hash_count: selectedToolCount,
    duplicate_tool_name_count: duplicates.length,
    total_token_bucket: tokenBucket(totalTokens),
    servers: servers.map((server) => ({
      server_hash: sha256(server.name),
      grade: server.grade,
      tool_count: server.toolCount,
      token_bucket: tokenBucket(server.totalTokens),
      highest_cost_tool_hashes: server.tools.slice(0, 5).map((tool) => sha256(`${server.name}/${tool.name}`)),
      error: Boolean(server.error),
    })),
  };
}

export function generateReport(
  servers: ServerAnalysis[],
  configPath: string
): string {
  const totalTokens = servers.reduce((sum, s) => sum + s.totalTokens, 0);
  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);
  const duplicates = findDuplicateTools(servers);

  let report = `# MCP Health Report\n\n`;
  report += `**Config:** ${configPath}\n`;
  report += `**Servers:** ${servers.length}\n`;
  report += `**Total tools:** ${totalTools}\n`;
  report += `**Total token cost:** ${totalTokens.toLocaleString()} tokens\n`;
  if (duplicates.length > 0) {
    report += `**Duplicate tools:** ${duplicates.length}\n`;
  }
  report += `\n---\n\n`;

  // Overall grade
  let overallGrade: string;
  const avgPerServer = servers.length > 0 ? totalTokens / servers.length : 0;
  if (avgPerServer <= 500) overallGrade = "A";
  else if (avgPerServer <= 1500) overallGrade = "B";
  else if (avgPerServer <= 3000) overallGrade = "C";
  else if (avgPerServer <= 6000) overallGrade = "D";
  else overallGrade = "F";
  report += `## Overall Grade: ${overallGrade}\n\n`;

  // Server summary table
  report += `## Server Summary\n\n`;
  report += `| Server | Grade | Tools | Tokens | Status |\n`;
  report += `|--------|-------|-------|--------|--------|\n`;
  for (const s of servers.sort((a, b) => b.totalTokens - a.totalTokens)) {
    const status = s.error ? `Error: ${s.error}` : "OK";
    report += `| ${s.name} | ${s.grade} | ${s.toolCount} | ${s.totalTokens.toLocaleString()} | ${status} |\n`;
  }
  report += `\n`;

  // Detailed per-server analysis
  for (const s of servers) {
    if (s.error) continue;
    report += `## ${s.name} (Grade: ${s.grade})\n\n`;
    report += `Command: \`${s.command}\`\n`;
    report += `Tools: ${s.toolCount} | Tokens: ${s.totalTokens.toLocaleString()}\n\n`;

    if (s.tools.length > 0) {
      report += `| Tool | Grade | Tokens | Issues |\n`;
      report += `|------|-------|--------|--------|\n`;
      for (const t of s.tools) {
        const issues = t.issues.length > 0 ? t.issues.join("; ") : "None";
        report += `| ${t.name} | ${t.grade} | ${t.totalTokens} | ${issues} |\n`;
      }
      report += `\n`;
    }
  }

  // Duplicates
  if (duplicates.length > 0) {
    report += `## Duplicate Tools\n\n`;
    report += `These tool names appear in multiple servers:\n\n`;
    for (const d of duplicates) {
      report += `- **${d.toolName}** — found in: ${d.servers.join(", ")}\n`;
    }
    report += `\n`;
  }

  // Recommendations
  report += `## Recommendations\n\n`;
  const worstServers = servers
    .filter((s) => !s.error && s.grade === "F")
    .sort((a, b) => b.totalTokens - a.totalTokens);
  if (worstServers.length > 0) {
    report += `### High-cost servers to review:\n`;
    for (const s of worstServers) {
      report += `- **${s.name}** costs ${s.totalTokens.toLocaleString()} tokens with ${s.toolCount} tools. Consider if you use all of them.\n`;
    }
    report += `\n`;
  }

  const bloatedTools = servers
    .flatMap((s) => s.tools.map((t) => ({ ...t, server: s.name })))
    .filter((t) => t.grade === "F")
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10);
  if (bloatedTools.length > 0) {
    report += `### Most expensive individual tools:\n`;
    for (const t of bloatedTools) {
      report += `- **${t.server}/${t.name}** — ${t.totalTokens} tokens (${t.issues.join("; ")})\n`;
    }
    report += `\n`;
  }

  if (totalTokens > 5000) {
    report += `### Token budget impact:\n`;
    report += `Your MCP servers consume ~${totalTokens.toLocaleString()} tokens before any conversation starts. `;
    report += `With Claude's 200K context window, that's ${((totalTokens / 200000) * 100).toFixed(1)}% used by MCP schemas alone.\n`;
  }

  report += `\n---\n*Generated by [mcp-health](https://www.npmjs.com/package/mcp-health)*\n`;

  return report;
}
