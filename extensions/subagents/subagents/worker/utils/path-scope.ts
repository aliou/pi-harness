import path from "node:path";

export function resolveAllowedPaths(cwd: string, files: string[]): Set<string> {
  return new Set(files.map((file) => path.resolve(cwd, file)));
}

export function isAllowedPath(
  cwd: string,
  allowedPaths: Set<string>,
  targetPath: string,
): boolean {
  const resolved = path.resolve(cwd, targetPath);
  return allowedPaths.has(resolved);
}
