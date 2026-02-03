# Archive

Lightweight one-off Pi extensions stored as gists and tracked as git submodules.

## Extensions

| Name | Description | Run Command | Gist |
|------|-------------|-------------|------|
| **pi-mono-pr-prep** | Tools and prompts for preparing PRs against badlogic/pi-mono<br>• `pr_next_number` tool<br>• `pr_open` tool<br>• `/pr-prep` prompt | `pi -e git:gist.github.com/aliou/70d2df9c2ec8351a7b83342e839bb73f` | [70d2df9c2ec8351a7b83342e839bb73f](https://gist.github.com/aliou/70d2df9c2ec8351a7b83342e839bb73f) |
| **stall-compaction** | Debug extension to force-trigger compaction with 15s delay<br>• `/stall-compact` command | `pi -e git:gist.github.com/aliou/3249be6c7d01683670c64f47f7164509` | [3249be6c7d01683670c64f47f7164509](https://gist.github.com/aliou/3249be6c7d01683670c64f47f7164509) |
| **surprise** | Fun extension with countdown and surprise URL<br>• `/surprise` command | `pi -e git:gist.github.com/aliou/fadcfb47f3fe06234b61c1a2d370d6aa` | [fadcfb47f3fe06234b61c1a2d370d6aa](https://gist.github.com/aliou/fadcfb47f3fe06234b61c1a2d370d6aa) |

## Usage

These extensions can be run directly via CLI:

```bash
pi -e git:gist.github.com/aliou/<gist-id>
```

Or added to project-specific settings in `.pi/settings.json`:

```json
{
  "packages": [
    "git:gist.github.com/aliou/70d2df9c2ec8351a7b83342e839bb73f"
  ]
}
```

## Submodules

To update all submodules:

```bash
git submodule update --remote --merge
```

To clone this repo with submodules:

```bash
git clone --recurse-submodules <repo-url>
```
