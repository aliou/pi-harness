{
  description = "pi-harness";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";

    git-hooks-nix = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
      ];

      imports = [
        inputs.git-hooks-nix.flakeModule
      ];

      perSystem =
        { config, pkgs, ... }:
        {
          pre-commit.settings.hooks = {
            biome-check = {
              enable = true;
              name = "biome check";
              entry = "node_modules/.bin/biome check --write";
              files = "\\.(ts|tsx|json)$";
              pass_filenames = false;
            };
            lockfile-check = {
              enable = true;
              name = "lockfile check";
              entry = "${pkgs.pnpm_10}/bin/pnpm install --frozen-lockfile --ignore-scripts";
              files = "(package\\.json|pnpm-lock\\.yaml|pnpm-workspace\\.yaml)$";
              pass_filenames = false;
            };
            typecheck = {
              enable = true;
              name = "typecheck";
              entry = "${pkgs.pnpm_10}/bin/pnpm run typecheck";
              files = "\\.tsx?$";
              pass_filenames = false;
            };
          };

          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs
              pnpm_10
            ];

            shellHook = ''
              ${config.pre-commit.installationScript}
            '';
          };
        };
    };
}
