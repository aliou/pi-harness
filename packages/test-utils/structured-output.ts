import type {
  AgentToolResult,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Value } from "typebox/value";
import { assert, expect } from "vitest";

/**
 * Assert that `tool` declares an `outputSchema` and that `result` carries a
 * `structuredContent` matching it. Pi does not validate this at runtime.
 */
export function expectStructuredOutput(
  tool: Pick<ToolDefinition, "name" | "outputSchema">,
  result: Pick<AgentToolResult<unknown>, "structuredContent">,
): void {
  const schema = tool.outputSchema;
  assert(schema, `${tool.name} should declare an outputSchema`);
  expect(result.structuredContent).toBeDefined();
  expect([...Value.Errors(schema, result.structuredContent)]).toEqual([]);
}
