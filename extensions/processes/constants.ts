// Custom message type for process update notifications
export const MESSAGE_TYPE_PROCESS_UPDATE = "ad-process:update";

// System prompt instructions for the processes extension
export const PROCESSES_SYSTEM_PROMPT = `
## Processes

Use processes to run long-lived commands in the background when subsequent tasks depend on them.

Common use cases:
- Starting an API server to generate OpenAPI schema
- Running a dev server while testing frontend changes
- Starting database containers before running migrations
- Running watch mode builds during development

Actions:
- \`start\`: Run command in background (give it a descriptive name)
- \`list\`: Show all managed processes
- \`output\`: Get recent stdout/stderr from a process
- \`logs\`: Get log file paths to inspect with read tool
- \`kill\`: Terminate a process
- \`clear\`: Remove finished processes from the list

**Example**: Generate OpenAPI schema from running server

\`\`\`
1. processes start: "npm run dev" (name: "api-server")
2. Wait for server to be ready (check output)
3. Fetch OpenAPI schema from localhost endpoint
4. processes kill: "api-server"
\`\`\`
`;
