import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

/**
 * Search for MCP config files in standard locations.
 * Returns the first found config with its path.
 */
export function findConfigFiles(): Array<{ path: string; config: McpConfig }> {
  const results: Array<{ path: string; config: McpConfig }> = [];

  const candidates = [
    // Current directory
    join(process.cwd(), ".mcp.json"),
    // Claude Desktop (Windows)
    join(homedir(), "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
    // Claude Desktop (macOS)
    join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    // Claude Desktop (Linux)
    join(homedir(), ".config", "Claude", "claude_desktop_config.json"),
    // Cursor
    join(process.cwd(), ".cursor", "mcp.json"),
  ];

  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        const raw = readFileSync(path, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.mcpServers) {
          results.push({ path, config: parsed });
        }
      }
    } catch {
      // skip invalid files
    }
  }

  return results;
}

export function readConfigFile(path: string): McpConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw);
  if (!parsed.mcpServers) {
    throw new Error(`No mcpServers found in ${path}`);
  }
  return parsed;
}
