---
description: Generate a shell.nix file for a project based on its dependencies and add it to .git/info/exclude
---

# Create shell.nix for Project

Generate a `shell.nix` file for the current project and add it to `.git/info/exclude`.

## Workflow

1. **Analyze project structure**
   - Check directory listing to identify project type
   - Look for configuration files: `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, etc.
   - Read relevant config files to understand dependencies

2. **Determine required dependencies**
   - Language toolchain (node, rust, go, python, etc.)
   - Build tools and package managers
   - System libraries needed by the project
   - Platform-specific dependencies (macOS frameworks, Linux libs)

3. **Create shell.nix**
   - Use `pkgs.mkShell` structure
   - Include all necessary `buildInputs`
   - Handle platform-specific dependencies with conditionals (e.g., `stdenv.isDarwin`)
   - Add useful environment variables
   - Include informative `shellHook` showing tool versions

4. **Add to git exclude**
   - Append `shell.nix` to `.git/info/exclude`
   - Verify it was added correctly

## Example shell.nix Structure

```nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Language toolchain
    # Build tools
    # System dependencies
    
    # Platform-specific
    (if stdenv.isDarwin then [
      # macOS frameworks
    ] else [
      # Linux libs
    ])
  ];

  # Environment variables
  EXAMPLE_VAR = "value";
  
  shellHook = ''
    echo "📦 Development environment"
    echo "Tool: $(tool --version)"
  '';
}
```

## Project Type Patterns

### Rust + Node.js (NAPI)
- cargo, rustc, rustfmt, rust-analyzer
- nodejs, package manager (npm/yarn/pnpm)
- pkg-config
- Clipboard: AppKit/Foundation (macOS), xorg.libX11/libxcb (Linux)

### Node.js
- nodejs (specific version or latest LTS)
- Package manager: npm/yarn/pnpm/bun
- Additional tools: typescript, eslint, prettier (if in devDeps)

### Rust
- cargo, rustc, rustfmt, rust-analyzer, clippy
- pkg-config (if needed)
- System libs based on dependencies

### Go
- go
- Additional tools based on project

### Python
- python3, pip
- virtualenv or specific Python version
- System libs for native extensions

## Notes

- Always add to `.git/info/exclude` not `.gitignore` - this is personal dev env setup
- Use platform conditionals for cross-platform projects
- Include helpful shellHook messages
- Pin versions only when necessary
- Consider project-specific environment variables
