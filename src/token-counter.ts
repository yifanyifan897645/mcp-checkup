import { encodingForModel } from "js-tiktoken";

let encoder: ReturnType<typeof encodingForModel> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = encodingForModel("gpt-4o"); // close enough for token estimation
  }
  return encoder;
}

export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

export function estimateSchemaTokens(schema: Record<string, unknown>): number {
  const json = JSON.stringify(schema, null, 2);
  return countTokens(json);
}

export interface ToolTokenAnalysis {
  name: string;
  description: string;
  descriptionTokens: number;
  schemaTokens: number;
  totalTokens: number;
  descriptionLength: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: string[];
}

export function analyzeToolTokens(tool: {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}): ToolTokenAnalysis {
  const description = tool.description || "";
  const descTokens = countTokens(description);

  // Build the full schema object as it would appear in context
  const fullSchema: Record<string, unknown> = {
    name: tool.name,
    description,
  };
  if (tool.inputSchema) {
    fullSchema.inputSchema = tool.inputSchema;
  }
  const schemaTokens = estimateSchemaTokens(fullSchema);

  const issues: string[] = [];

  if (description.length > 500) {
    issues.push(`Description is ${description.length} chars — consider shortening to <200`);
  } else if (description.length > 200) {
    issues.push(`Description is ${description.length} chars — could be more concise`);
  }

  if (descTokens > 200) {
    issues.push(`Description alone costs ${descTokens} tokens`);
  }

  if (tool.inputSchema) {
    const paramSchema = tool.inputSchema as { properties?: Record<string, { description?: string }> };
    if (paramSchema.properties) {
      for (const [paramName, paramDef] of Object.entries(paramSchema.properties)) {
        if (paramDef.description && paramDef.description.length > 200) {
          issues.push(`Parameter '${paramName}' has a ${paramDef.description.length}-char description`);
        }
      }
    }
  }

  // Grading based on total token cost per tool
  let grade: ToolTokenAnalysis["grade"];
  if (schemaTokens <= 100) grade = "A";
  else if (schemaTokens <= 300) grade = "B";
  else if (schemaTokens <= 600) grade = "C";
  else if (schemaTokens <= 1000) grade = "D";
  else grade = "F";

  return {
    name: tool.name,
    description: description.substring(0, 100) + (description.length > 100 ? "..." : ""),
    descriptionTokens: descTokens,
    schemaTokens,
    totalTokens: schemaTokens,
    descriptionLength: description.length,
    grade,
    issues,
  };
}
