---
"@aliou/pi-processes": minor
---

Trigger agent turn on process end based on alert flags. Rename `notifyOnSuccess`/`notifyOnFailure`/`notifyOnKill` to `alertOnSuccess`/`alertOnFailure`/`alertOnKill`. These flags now control whether the agent gets a turn to react when a process ends, rather than just sending a silent message.
