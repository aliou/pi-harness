export function blockedPathResult(targetPath: string, files: string[]) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: Path '${targetPath}' is outside worker scope. Allowed files:\n${files
          .map((f) => `- ${f}`)
          .join("\n")}`,
      },
    ],
    details: {
      blocked: true,
      kind: "path-scope",
      targetPath,
      allowedFiles: files,
    },
  };
}

export function blockedCommandResult(reason: string, command?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${reason}`,
      },
    ],
    details: {
      blocked: true,
      kind: "command-policy",
      reason,
      command,
    },
  };
}
