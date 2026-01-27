---
"@aliou/pi-guardrails": minor
---

Add preventPython guardrail to block Python tools.

- Block python, python3, pip, pip3, poetry, pyenv, virtualenv, and venv commands.
- Recommend using uv for Python package management instead.
- Disabled by default, configurable via settings.
- Provides helpful guidance on using uv as a replacement.
