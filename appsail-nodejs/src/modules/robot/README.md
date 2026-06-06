# Module: `robot`

Handles the single ESP32 robot connection.

Responsibilities:
- Register one robot at a time (kick previous on collision)
- Forward incoming telemetry to controllers
- Status broadcasts on connect/disconnect
