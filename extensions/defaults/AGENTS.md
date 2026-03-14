# defaults

Personal sensible defaults and quality-of-life improvements for Pi.

## Layout

- `tools/` - Tool overrides and custom tools (`read`, `edit`, `find`, `bash`, `get_current_time`, `read_url`)
- `hooks/` - Event hooks (AGENTS.md discovery, notifications, terminal title, session naming)
- `commands/` - Slash commands (`/theme`, `/project:init`, `/ad:settings`, `/defaults:update`)
- `components/` - UI components (theme selector, text viewer)
- `lib/` - Shared logic (title generation, AGENTS.md discovery manager, tool setup)
- `config.ts` - Extension config schema and loader
- `setup-commands.ts` - Registers extension commands
- `index.ts` - Entry point, wires everything together
