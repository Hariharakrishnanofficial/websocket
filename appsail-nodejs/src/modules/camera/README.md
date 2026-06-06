# Module: `camera`

Handles the single ESP32-CAM connection.

Responsibilities:
- Register one camera at a time
- Fan binary JPEG frames out to all controllers (with back-pressure drop)
- Maintain video stats (fps, kbps, lastFrameAt)
