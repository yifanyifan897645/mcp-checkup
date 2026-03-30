# mcp-checkup

[![npm version](https://img.shields.io/npm/v/mcp-checkup.svg)](https://www.npmjs.com/package/mcp-checkup)
[![npm downloads](https://img.shields.io/npm/dm/mcp-checkup.svg)](https://www.npmjs.com/package/mcp-checkup)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Your MCP servers are eating your context window. Find out how much.

**mcp-checkup** is an MCP server that analyzes your MCP setup — measuring the token cost of every installed server and tool, finding duplicates, grading efficiency, and generating optimization reports.

## Quick Start

```bash
npx mcp-checkup
```

Then ask your AI assistant:

```
"Run an MCP health check on my setup"
"How many tokens are my MCP servers using?"
"Generate an MCP health report"
```

## Why?

Every MCP tool costs **550–1,400 tokens** just for its schema. A server with 50 tools can eat **30,000+ tokens** before you type anything. Most developers have no idea how much context window their MCP servers are consuming.

**Real examples from the community:**
- Adding GitHub MCP increased one user's token usage from 34K to 80K ([source](https://github.com/github/github-mcp-server/issues/1286))
- One developer found 67,000 tokens consumed by just 4 servers before any conversation ([source](https://mariogiancini.com/the-hidden-cost-of-mcp-servers-and-when-theyre-worth-it))
- Context7 (240K weekly downloads) has tool descriptions costing 3x more tokens than necessary ([source](https://dev.to/0coceo/the-1-most-popular-mcp-server-gets-an-f-2olm))

## Tools

### `analyze_servers`
Scan your MCP config and measure the token cost of every installed server. Auto-detects config files.

```
"Which of my MCP servers costs the most tokens?"
```

### `analyze_tools`
Deep-dive into a specific server — per-tool token costs, grades, bloated descriptions, and optimization suggestions.

```
"Break down the token cost of my GitHub MCP server"
```

### `find_duplicates`
Find duplicate tool names across your installed servers. Redundant tools waste context for no benefit.

```
"Do any of my MCP servers have overlapping tools?"
```

### `count_tokens`
Count tokens in any text. Useful for estimating context usage.

```
"How many tokens is this prompt?"
```

### `generate_report`
Full markdown health report: server grades (A-F), token costs, duplicates, and actionable recommendations.

```
"Generate a full MCP health report"
```

## Grading System

### Per-Tool Grades
| Grade | Tokens | Meaning |
|-------|--------|---------|
| A | ≤100 | Excellent — minimal context cost |
| B | ≤300 | Good — reasonable schema size |
| C | ≤600 | Fair — could be optimized |
| D | ≤1000 | Poor — bloated schema |
| F | >1000 | Failing — severely impacts context window |

### Per-Server Grades
| Grade | Total Tokens | Meaning |
|-------|-------------|---------|
| A | ≤500 | Lean and efficient |
| B | ≤1500 | Reasonable |
| C | ≤3000 | Getting heavy |
| D | ≤6000 | Significant context cost |
| F | >6000 | Major context window drain |

## Installation

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "mcp-checkup": {
      "command": "npx",
      "args": ["-y", "mcp-checkup"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` with the same format.

## Auto-Detection

mcp-checkup automatically finds your MCP config in these locations:
- `.mcp.json` (current directory)
- Claude Desktop config (Windows/macOS/Linux)
- `.cursor/mcp.json`

Or pass a custom path to any tool.

## How It Compares

| Tool | Purpose | Approach |
|------|---------|----------|
| **mcp-checkup** | Diagnose token costs | Analyze & report — see exactly what each tool costs |
| [lean-ctx](https://github.com/yvgude/lean-ctx) | Reduce token usage | Compress context at runtime |
| [MCP Inspector](https://github.com/modelcontextprotocol/inspector) | Debug MCP servers | Test connections and tool calls |

**Use mcp-checkup first** to find the problem, then decide how to fix it.

## Part of the MCP Toolkit

**[View all servers →](https://yifanyifan897645.github.io/mcp-toolkit/)**

- [webcheck-mcp](https://www.npmjs.com/package/webcheck-mcp) — Website health analysis
- [git-summary-mcp](https://www.npmjs.com/package/git-summary-mcp) — Git repository intelligence
- [mcp-checkup](https://www.npmjs.com/package/mcp-checkup) — MCP setup health analyzer
- [dev-utils-mcp](https://www.npmjs.com/package/dev-utils-mcp) — Developer utilities
- [codescan-mcp](https://www.npmjs.com/package/codescan-mcp) — Codebase health scanner

## License

MIT

---

**Want to build your own MCP server?** Check out our [MCP Server Development Kit](https://ifdian.net/item/fdfddfb02c1311f1ae625254001e7c00) — includes TypeScript templates, market research, niche analysis, and monetization strategies.
