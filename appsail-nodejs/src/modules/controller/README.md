# Module: `controller`

Handles browser-side joystick clients.

Responsibilities:
- Validate `hello` registration + optional token
- Track per-controller rate limit + dedupe state
- Forward single-char commands to the active robot
- Receive telemetry broadcasts from `robot` module
