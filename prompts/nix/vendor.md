---
description: Add a package to a Nix development environment (shell.nix or flake.nix devShell)
---

# Vendor Package to Nix Dev Environment

Add a package to the current project's Nix development environment, whether it's a `shell.nix` or `flake.nix` devShell.

## Workflow

1. **Identify the environment file**
   - Check for `shell.nix` or `flake.nix` at project root
   - Read the file to understand current structure

2. **Research the package**
   - Search nixpkgs to find the correct package name
   - Verify it's available: `nix-env -qaP <package-name>`
   - Check if it needs platform-specific handling

3. **Determine package category**
   - Build tool (cargo, rustc, go, node, etc.)
   - Development tool (rust-analyzer, typescript, etc.)
   - System library (pkg-config, openssl, etc.)
   - Platform-specific dependency (macOS framework, Linux lib)

4. **Add to appropriate section**
   - Add to `buildInputs` with clear comments
   - Group with related packages
   - Handle platform conditionals if needed

5. **Verify**
   - Exit current shell (if in one)
   - Enter new shell: `nix-shell` or `nix develop`
   - Verify package is available: `which <command>` or `<command> --version`

## shell.nix Pattern

```nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Existing packages...
    
    # New package with comment explaining why
    package-name  # Brief reason
  ];
}
```

## flake.nix devShell Pattern

```nix
{
  outputs = { self, nixpkgs }: {
    devShells = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-darwin" ] (system:
      let pkgs = nixpkgs.legacyPackages.${system};
      in {
        default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Existing packages...
            
            # New package with comment
            package-name
          ];
        };
      }
    );
  };
}
```

## Platform-Specific Packages

When package is platform-specific:

```nix
buildInputs = with pkgs; [
  # Common packages...
  
] ++ lib.optionals stdenv.isDarwin [
  # macOS-only packages
  darwin.apple_sdk.frameworks.AppKit
] ++ lib.optionals stdenv.isLinux [
  # Linux-only packages
  xorg.libX11
];
```

## Common Package Categories

### macOS Frameworks
- Search: `darwin.apple_sdk.frameworks.*`
- Examples: `AppKit`, `Foundation`, `Security`, `IOKit`

### Linux Libraries
- Search: Usually package name + `-dev` in other distros
- Examples: `xorg.libX11`, `libxcb`, `openssl`, `pkg-config`

### Language Toolchains
- `nodejs`, `nodejs_20`, `nodejs_22`
- `rustc`, `cargo`, `rust-analyzer`
- `go`, `gopls`
- `python3`, `python311`, `python312`

### Build Tools
- `pkg-config` - Most common for finding C libraries
- `cmake`, `gnumake`, `autoconf`
- `gcc`, `clang`

## Finding Package Names

```bash
# Search for package
nix search nixpkgs <query>

# Alternative: nix-env
nix-env -qaP <package-name>

# Check package details
nix-env -qaP --description <package-name>
```

## Notes

- Add packages to `buildInputs`, not `nativeBuildInputs` (for dev shells)
- Include comment explaining why package is needed
- Group related packages together
- Use platform conditionals for cross-platform projects
- After adding, always verify package is accessible in new shell
