import * as fs from "node:fs";
import * as path from "node:path";

export function getPiVersion(): string {
  try {
    const packageJsonPath = path.resolve(
      import.meta.dirname,
      "../../package.json",
    );
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return (
      packageJson.devDependencies?.["@mariozechner/pi-coding-agent"] ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}
