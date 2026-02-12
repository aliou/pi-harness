{
  description = "Pi extensions monorepo";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";

    git-hooks-nix = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
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
        inputs.treefmt-nix.flakeModule
      ];

      perSystem =
        { config, pkgs, ... }:
        {
          treefmt.config = {
            programs.biome = {
              enable = true;
              includes = [
                "*.json"
                "*.ts"
              ];
              settings = {
                formatter = {
                  indentStyle = "space";
                  indentWidth = 2;
                };
              };
            };
          };

          pre-commit.settings.hooks = {
            treefmt.enable = true;
            biome-check = {
              enable = true;
              name = "biome check";
              entry = "${pkgs.biome}/bin/biome check --write";
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
            public-deps-check = {
              enable = true;
              name = "public deps check";
              entry = "${pkgs.nodejs}/bin/node scripts/check-public-deps.mjs";
              files = "package\\.json$";
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
