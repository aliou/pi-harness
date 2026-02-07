/**
 * Project tech stack scanner.
 *
 * Detects languages, frameworks, and tools from manifest files in cwd.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface ProjectStack {
  languages: string[];
  frameworks: string[];
  tools: string[];
  /** Raw summary string for display and prompt injection. */
  summary: string;
}

interface Detection {
  file: string;
  detect: (content: string) => {
    languages?: string[];
    frameworks?: string[];
    tools?: string[];
  };
}

const DETECTIONS: Detection[] = [
  {
    file: "package.json",
    detect: (content) => {
      const pkg = JSON.parse(content) as Record<string, unknown>;
      const all = {
        ...(pkg.dependencies as Record<string, unknown> | undefined),
        ...(pkg.devDependencies as Record<string, unknown> | undefined),
      };
      const languages = ["JavaScript"];
      const frameworks: string[] = [];
      const tools: string[] = [];

      if (all.typescript || existsSync("tsconfig.json"))
        languages.push("TypeScript");
      if (all.react || all["react-dom"]) frameworks.push("React");
      if (all.next) frameworks.push("Next.js");
      if (all.vue) frameworks.push("Vue");
      if (all.svelte) frameworks.push("Svelte");
      if (all.express) frameworks.push("Express");
      if (all.fastify) frameworks.push("Fastify");
      if (all.hono) frameworks.push("Hono");
      if (all.vitest) tools.push("Vitest");
      if (all.jest) tools.push("Jest");
      if (all["@biomejs/biome"]) tools.push("Biome");
      if (all.eslint) tools.push("ESLint");
      if (all.prettier) tools.push("Prettier");
      if (all.tailwindcss) tools.push("Tailwind CSS");
      if (all.drizzle) tools.push("Drizzle ORM");
      if (all.prisma || all["@prisma/client"]) tools.push("Prisma");

      return { languages, frameworks, tools };
    },
  },
  {
    file: "Cargo.toml",
    detect: () => ({ languages: ["Rust"], tools: ["Cargo"] }),
  },
  {
    file: "go.mod",
    detect: () => ({ languages: ["Go"] }),
  },
  {
    file: "pyproject.toml",
    detect: () => ({ languages: ["Python"] }),
  },
  {
    file: "requirements.txt",
    detect: () => ({ languages: ["Python"] }),
  },
  {
    file: "Gemfile",
    detect: () => ({ languages: ["Ruby"], frameworks: ["Rails"] }),
  },
  {
    file: "build.gradle",
    detect: () => ({ languages: ["Java/Kotlin"], tools: ["Gradle"] }),
  },
  {
    file: "pom.xml",
    detect: () => ({ languages: ["Java"], tools: ["Maven"] }),
  },
  {
    file: "Package.swift",
    detect: () => ({ languages: ["Swift"] }),
  },
  {
    file: "flake.nix",
    detect: () => ({ tools: ["Nix"] }),
  },
  {
    file: "docker-compose.yml",
    detect: () => ({ tools: ["Docker"] }),
  },
  {
    file: "Dockerfile",
    detect: () => ({ tools: ["Docker"] }),
  },
];

/** Scan cwd for tech stack indicators. */
export async function scanProject(cwd: string): Promise<ProjectStack> {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const tools = new Set<string>();

  for (const detection of DETECTIONS) {
    const filePath = resolve(cwd, detection.file);
    if (!existsSync(filePath)) continue;

    try {
      const content = await readFile(filePath, "utf-8");
      const result = detection.detect(content);
      for (const l of result.languages ?? []) languages.add(l);
      for (const f of result.frameworks ?? []) frameworks.add(f);
      for (const t of result.tools ?? []) tools.add(t);
    } catch {
      // skip unreadable files
    }
  }

  const parts: string[] = [];
  if (languages.size > 0) parts.push(`Languages: ${[...languages].join(", ")}`);
  if (frameworks.size > 0)
    parts.push(`Frameworks: ${[...frameworks].join(", ")}`);
  if (tools.size > 0) parts.push(`Tools: ${[...tools].join(", ")}`);

  return {
    languages: [...languages],
    frameworks: [...frameworks],
    tools: [...tools],
    summary: parts.length > 0 ? parts.join(" | ") : "No stack detected",
  };
}
