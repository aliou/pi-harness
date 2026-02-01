import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const AGENTS_FILENAME = "AGENTS.md";

export interface DiscoveredFile {
  path: string;
  content: string;
}

export class AgentsDiscoveryManager {
  private loadedAgents = new Set<string>();
  private currentCwd = "";
  private cwdAgentsPath = "";
  private homeDir = "";

  resetSession(cwd: string) {
    this.currentCwd = this.resolvePath(cwd, process.cwd());
    this.cwdAgentsPath = path.join(this.currentCwd, AGENTS_FILENAME);
    this.homeDir = this.resolvePath(os.homedir(), process.cwd());
    this.loadedAgents.clear();

    // Mark cwd AGENTS.md as loaded (already in system prompt)
    this.loadedAgents.add(this.cwdAgentsPath);

    // Mark global AGENTS.md as loaded (already in system prompt)
    const globalAgentsPath = path.join(
      this.homeDir,
      ".pi",
      "agent",
      AGENTS_FILENAME,
    );
    if (fs.existsSync(globalAgentsPath)) {
      this.loadedAgents.add(
        this.resolvePath(globalAgentsPath, this.currentCwd),
      );
    }

    // Mark ancestor AGENTS.md files as loaded (already in system prompt)
    // Walk up from cwd to root, matching Pi's loadProjectContextFiles logic
    let dir = path.dirname(this.currentCwd);
    while (dir !== path.dirname(dir)) {
      const ancestorAgentsPath = path.join(dir, AGENTS_FILENAME);
      if (fs.existsSync(ancestorAgentsPath)) {
        this.loadedAgents.add(
          this.resolvePath(ancestorAgentsPath, this.currentCwd),
        );
      }
      dir = path.dirname(dir);
    }
  }

  /**
   * Discover and load AGENTS.md files for a given file path.
   * Returns newly discovered files (already-loaded files are skipped).
   * Returns null if the path is outside known roots or is itself an AGENTS.md.
   */
  async discover(filePath: string): Promise<DiscoveredFile[] | null> {
    const absolutePath = this.resolvePath(filePath, this.currentCwd);

    const searchRoot = this.isInsideRoot(this.currentCwd, absolutePath)
      ? this.currentCwd
      : this.isInsideRoot(this.homeDir, absolutePath)
        ? this.homeDir
        : "";

    if (!searchRoot) return null;

    // If the agent is reading an AGENTS.md directly, mark it as loaded.
    if (path.basename(absolutePath) === AGENTS_FILENAME) {
      this.loadedAgents.add(path.normalize(absolutePath));
      return null;
    }

    const candidates = this.findAgentsFiles(absolutePath, searchRoot);
    const discovered: DiscoveredFile[] = [];

    for (const agentsPath of candidates) {
      if (this.loadedAgents.has(agentsPath)) continue;

      const content = await fs.promises.readFile(agentsPath, "utf-8");
      this.loadedAgents.add(agentsPath);
      discovered.push({ path: agentsPath, content });
    }

    return discovered.length > 0 ? discovered : null;
  }

  get isInitialized(): boolean {
    return this.currentCwd !== "";
  }

  get cwd(): string {
    return this.currentCwd;
  }

  private resolvePath(targetPath: string, baseDir: string): string {
    const absolute = path.isAbsolute(targetPath)
      ? path.normalize(targetPath)
      : path.resolve(baseDir, targetPath);

    try {
      return fs.realpathSync.native?.(absolute) ?? fs.realpathSync(absolute);
    } catch {
      return absolute;
    }
  }

  private isInsideRoot(rootDir: string, targetPath: string): boolean {
    if (!rootDir) return false;
    const relative = path.relative(rootDir, targetPath);
    return (
      relative === "" ||
      (!relative.startsWith("..") && !path.isAbsolute(relative))
    );
  }

  private findAgentsFiles(filePath: string, rootDir: string): string[] {
    if (!rootDir) return [];

    const agentsFiles: string[] = [];
    let dir = path.dirname(filePath);

    while (this.isInsideRoot(rootDir, dir)) {
      const candidate = path.join(dir, AGENTS_FILENAME);
      if (candidate !== this.cwdAgentsPath && fs.existsSync(candidate)) {
        agentsFiles.push(candidate);
      }

      if (dir === rootDir) break;

      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    // Return in root-first order.
    return agentsFiles.reverse();
  }
}
