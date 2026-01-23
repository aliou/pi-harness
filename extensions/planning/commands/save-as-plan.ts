/**
 * Save Plan Command
 *
 * Converts the current conversation into a structured implementation plan.
 * The agent figures out everything - name, structure, content.
 *
 * Usage:
 *   /plan:save
 *   /plan:save focus on the error handling approach we discussed
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SAVE_AS_PLAN_PROMPT = `Review our entire conversation thread and create a comprehensive technical implementation plan for another agent to execute (they won't have access to our conversation).

## Process:

1. **Analyze the conversation:**
   - Identify the main goal/feature
   - List all approaches discussed (accepted AND rejected, with reasons)
   - Note explicit agreements and decisions made
   - Identify any open questions or decision points

2. **Ask clarifying questions:**
   - If confidence < 95% on any decision, ask before proceeding
   - Confirm decisions on any ambiguous points
   - Verify file locations, naming conventions, and integration points
   - Use the \`ask_user\` tool if available

3. **Write the plan with these sections:**
   - **Goal/Overview** - What we're building and why
   - **Dependencies** - New packages, tools, or systems needed
   - **File Structure** - New files and modifications to existing files
   - **Component Breakdown** - Detailed description of each component with code signatures
   - **Integration Points** - How it connects to existing code
   - **Implementation Order** - Step-by-step sequence with checkboxes
   - **Error Handling** - Edge cases and failure scenarios
   - **Testing Strategy** - How to verify it works
   - **Decision Points** - Key choices made and alternatives considered
   - **Future Enhancements** - Optional improvements for later
   - **Implementation Progress** - Section for tracking work (initially empty)

4. **Save the plan:**
   - Create \`.agents/plans/\` directory if it doesn't exist
   - Location: \`.agents/plans/YYYY-MM-DD-<descriptive-name>.md\`
   - Use current date (ISO format) as prefix: {curdate}
   - Use kebab-case for descriptive name (derive from the main goal)
   - Include architecture rationale
   - Be specific about file paths, function signatures, and data flow
   - **Add YAML frontmatter** at the top of the plan file with:
     - \`date\`: The date from the filename (YYYY-MM-DD format)
     - \`title\`: Human-readable title of the plan (convert kebab-case name to title case)
     - \`directory\`: Absolute path of the project directory where the plan was created
     - \`project\`: (optional) Project name. Determine by checking:
       1. If an \`AGENTS.md\` file exists at project root and defines a project name, use that
       2. Otherwise, use the project directory name
       3. Omit this key if it would just duplicate the directory name
     - \`status\`: Always set to \`pending\` for new plans
     - \`dependencies\`: Array of plan slugs this depends on (empty array if none)
     - \`dependents\`: Array of plan slugs that depend on this (empty array if none)
   
   - **Slug convention**: Slug = filename without date prefix and .md extension
     - Example: \`2026-01-22-phase-1-auth.md\` → slug is \`phase-1-auth\`
   
   - **Multiple related plans**: If work naturally splits into phases or modules:
     - Create separate plan files for each phase
     - Use consistent naming: \`phase-1-<name>\`, \`phase-2-<name>\`, etc.
     - Set dependencies/dependents arrays to link them
     - Example: Phase 2 has \`dependencies: [phase-1-display-infrastructure]\`

## Guidelines:

- Be thorough - assume the implementing agent knows the tech stack but not our conversation
- Include code examples where helpful (signatures, interfaces, example usage)
- Explain WHY decisions were made, not just WHAT to do
- Note rejected approaches with brief reasoning (saves time investigating dead ends)
- Use absolute file paths when referencing existing files
- Include relevant links to existing patterns in the codebase to follow`;

export function setupSaveAsPlanCommand(pi: ExtensionAPI) {
  pi.registerCommand("plan:save", {
    description: "Create implementation plan from conversation",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();

      const additionalInstructions = args.trim();
      const currentDate = new Date().toISOString().split("T")[0] ?? "";
      let prompt = SAVE_AS_PLAN_PROMPT.replace("{curdate}", currentDate);

      if (additionalInstructions) {
        prompt += `\n\n## Additional Instructions\n\n${additionalInstructions}`;
      }

      pi.sendUserMessage(prompt);
    },
  });
}
