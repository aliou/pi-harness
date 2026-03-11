# pi-harness

My personal harness around [Pi](https://github.com/badlogic/pi-mono/) for coding-agent work.

> [!WARNING]
> Feel free to use these, but they're mainly for my personal use and I might not read/merge your pr. Also, I haven't read a single line of code so I can't be held responsible if something bad happens. Godspeed ✌️

## Install

Install the repository as a Pi package:

```bash
pi install git:github.com/aliou/pi-harness
```

To install selectively, or disable specific extensions, edit your `settings.json`:

```json
{
  "packages": [
    {
      "source": "git:github.com/aliou/pi-harness",
      "extensions": [
        "extensions/defaults/index.ts",
        "extensions/providers/index.ts",
        "!extensions/the-dumb-zone/index.ts"
      ]
    }
  ]
}
```

## Integrations

This repo also includes two integrations:

- [Neovim](integrations/neovim/README.md) - Neovim integration for Pi.
- [Chrome](integrations/chrome/README.md) - Chrome extension and native host bridge for browser automation and sidepanel chat.
