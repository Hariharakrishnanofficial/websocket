/*
 * ============================================================================
 *  ESP32-CAM Video Client - WebSocket MJPEG Streamer (AppSail-ready)
 * ============================================================================
 *  Captures JPEG frames from the OV2640 sensor and streams them as binary
 *  WebSocket frames to the Catalyst AppSail relay on path /video. The relay
 *  fans the frames out to every connected controller (Slate PWA), which
 *  decodes them via `createImageBitmap` and paints them on a canvas.
 *
 *  Target board:   AI-Thinker ESP32-CAM (most common, ~$8 module)
 *                  Arduino IDE -> Tools -> Board: "AI Thinker ESP32-CAM"
 *                                Partition Scheme: "Huge APP (3MB No OTA/1MB SPIFFS)"
 *                                PSRAM: "Enabled"  (REQUIRED for >QVGA)
 *
 *  Required libraries (Arduino IDE -> Library Manager):
 *      - ArduinoWebsockets   by Gil Maimon  (>= 0.5.4)
 *      - esp32 board package by Espressif   (>= 2.0.11) - bundles esp_camera.h
 *
 *  Protocol (ESP32-CAM -> server):
 *      1. JSON registration frame:  {"type":"camera","token":"<optional>"}
 *      2. Repeated binary frames:   raw JPEG bytes (one frame per WS message)
 *
 *  The server ignores any text frames from a camera, and never sends commands
 *  back to it (cameras are write-only). If the WS link drops, the capture
 *  loop pauses and reconnects automatically. The companion firmware
 *  `esp32_robot.ino` handles motion commands on a separate connection.
 *
 *  Power note:
 *      Do NOT share the motor battery rail. Feed the ESP32-CAM from its own
 *      regulated 5V/2A supply (or a buck converter off the main pack). The
 *      OV2640 + Wi-Fi TX can draw 600 mA peaks - brown-outs cause silent
 *      framebuffer corruption that looks like a "frozen stream" bug.
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoWebsockets.h>
#include "esp_camera.h"

using namespace websockets;

// ---------------------------------------------------------------------------
// USER CONFIG  ---  EDIT THESE
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Live AppSail relay (must match esp32_robot.ino host). Path is /video, NOT /ws.
const char* WS_SERVER_URL = "wss://krishnanhari-b8hfpk0w-4600.zcodeusers.in/video";

// Shared secret sent in the registration frame. Must match CAMERA_TOKEN
// (or ROBOT_TOKEN, depending on relay config) in the AppSail environment.
// Leave empty ("") to disable token auth (dev only).
const char* CAMERA_TOKEN = "";

// ---------------------------------------------------------------------------
// STREAM TUNING
// ---------------------------------------------------------------------------
//   FRAMESIZE_QVGA   320x240   ~6-8 KB/frame  -> 20-25 fps, lowest latency
//   FRAMESIZE_VGA    640x480   ~15-25 KB/frame -> 12-15 fps, recommended
//   FRAMESIZE_SVGA   800x600   ~30-45 KB/frame -> 8-10 fps
//   FRAMESIZE_HD    1280x720   ~60-90 KB/frame -> 5-7 fps (PSRAM required)
//
// JPEG quality: 0 (best) - 63 (worst). 10-15 is the sweet spot.
// Lower quality = smaller frames = lower latency, but blockier image.
const framesize_t CAM_FRAME_SIZE  = FRAMESIZE_VGA;
const int         CAM_JPEG_QUALITY = 12;
const int         CAM_FB_COUNT     = 2;     // double-buffer = smoother fps

// Minimum gap between frame sends, in ms. 66 ms = ~15 fps cap.
// Prevents flooding the WS link / relay during good Wi-Fi conditions.
const uint32_t MIN_FRAME_INTERVAL_MS = 66;

// Connectivity timing
const uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
const uint32_t WS_RETRY_MS             = 2000;
const uint32_t STATUS_PRINT_MS         = 10000;

// ---------------------------------------------------------------------------
// TLS  ---  USERTrust RSA root (same anchor as esp32_robot.ino)
// ---------------------------------------------------------------------------
//   We MUST supply a CA cert because `setInsecure()` is broken in the
//   ArduinoWebsockets ESP32 backend (see esp32_robot.ino for the full
//   explanation). Reusing the identical PEM here keeps both clients in sync.
const char* ROOT_CA_PEM = R"PEM(
-----BEGIN CERTIFICATE-----
MIIF3jCCA8agAwIBAgIQAf1tMPyjylGoG7xkDjUDLTANBgkqhkiG9w0BAQwFADCB
iDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCk5ldyBKZXJzZXkxFDASBgNVBAcTC0pl
cnNleSBDaXR5MR4wHAYDVQQKExVUaGUgVVNFUlRSVVNUIE5ldHdvcmsxLjAsBgNV
BAMTJVVTRVJUcnVzdCBSU0EgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkwHhcNMTAw
MjAxMDAwMDAwWhcNMzgwMTE4MjM1OTU5WjCBiDELMAkGA1UEBhMCVVMxEzARBgNV
BAgTCk5ldyBKZXJzZXkxFDASBgNVBAcTC0plcnNleSBDaXR5MR4wHAYDVQQKExVU
aGUgVVNFUlRSVVNUIE5ldHdvcmsxLjAsBgNVBAMTJVVTRVJUcnVzdCBSU0EgQ2Vy
dGlmaWNhdGlvbiBBdXRob3JpdHkwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIK
AoICAQCAEmUXNg7D2wiz0KxXDXbtzSfTTK1Qg2HiqiBNCS1kCdzOiZ/MPans9s/B
3PHTsdZ7NygRK0faOca8Ohm0X6a9fZ2jY0K2dvKpOyuR+OJv0OwWIJAJPuLodMkY
tJHUYmTbf6MG8YgYapAiPLz+E/CHFHv25B+O1ORRxhFnRghRy4YUVD+8M/5+bJz/
Fp0YvVGONaanZshyZ9shZrHUm3gDwFA66Mzw3LyeTP6vBZY1H1dat//O+T23LLb2
VN3I5xI6Ta5MirdcmrS3ID3KfyI0rn47aGYBROcBTkZTmzNg95S+UzeQc0PzMsNT
79uq/nROacdrjGCT3sTHDN/hMq7MkztReJVni+49Vv4M0GkPGw/zJSZrM233bkf6
c0Plfg6lZrEpfDKEY1WJxA3Bk1QwGROs0303p+tdOmw1XNtB1xLaqUkL39iAigmT
Yo61Zs8liM2EuLE/pDkP2QKe6xJMlXzzawWpXhaDzLhn4ugTncxbgtNMs+1b/97l
c6wjOy0AvzVVdAlJ2ElYGn+SNuZRkg7zJn0cTRe8yexDJtC/QV9AqURE9JnnV4ee
UB9XVKg+/XRjL7FQZQnmWEIuQxpMtPAlR1n6BB6T1CZGSlCBst6+eLf8ZxXhyVeE
Hg9j1uliutZfVS7qXMYoCAQlObgOK6nyTJccBz8NUvXt7y+CDwIDAQABo0IwQDAd
BgNVHQ4EFgQUU3m/WqorSs9UgOHYm8Cd8rIDZsswDgYDVR0PAQH/BAQDAgEGMA8G
A1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEMBQADggIBAFzUfA3P9wF9QZllDHPF
Up/L+M+ZBn8b2kMVn54CVVeWFPFSPCeHlCjtHzoBN6J2/FNQwISbxmtOuowhT6KO
VWKR82kV2LyI48SqC/3vqOlLVSoGIG1VeCkZ7l8wXEskEVX/JJpuXior7gtNn3/3
ATiUFJVDBwn7YKnuHKsSjKCaXqeYalltiz8I+8jRRa8YFWSQEg9zKC7F4iRO/Fjs
8PRF/iKz6y+O0tlFYQXBl2+odnKPi4w2r78NBc5xjeambx9spnFixdjQg3IM8WcR
iQycE0xyNN+81XHfqnHd4blsjDwSXWXavVcStkNr/+XeTWYRUc+ZruwXtuhxkYze
Sf7dNXGiFSeUHM9h4ya7b6NnJSFd5t0dCy5oGzuCr+yDZ4XUmFF0sbmZgIn/f3gZ
XHlKYC6SQK5MNyosycdiyA5d9zZbyuAlJQG03RoHnHcAP9Dc1ew91Pq7P8yF1m9/
qS3fuQL39ZeatTXaw2ewh0qpKJ4jjv9cJ2vhsE/zB+4ALtRZh8tSQZXq9EfX7mRB
VXyNWQKV3WKdwrnuWih0hKWbt5DHDAff9Yk2dDLWKMGwsAvgnEzDHNb842m1R0aB
L6KCq9NjRHDEjf8tM7qtj3u1cIiuPhnPQCjY/MiQu12ZIvVS5ljFH4gxQ+6IHdfG
jjxDah2nGN59PRbxYvnKkKj9
-----END CERTIFICATE-----
)PEM";

// ---------------------------------------------------------------------------
// AI-Thinker ESP32-CAM pin map (do NOT change unless you have a clone board)
// ---------------------------------------------------------------------------
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// AI-Thinker has an onboard LED on GPIO33 (active LOW) and the flash on GPIO4.
// We use GPIO33 as a link-status indicator; flash is left untouched.
const int PIN_STATUS_LED = 33;
#define LED_ON  LOW
#define LED_OFF HIGH

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
WebsocketsClient wsClient;

bool     cameraReady     = false;
bool     wsConnected     = false;
uint32_t nextWsRetryMs   = 0;
uint32_t lastFrameMs     = 0;
uint32_t lastStatusMs    = 0;

// Frame stats (printed periodically; also useful to confirm relay throughput)
uint32_t framesSentWindow  = 0;
uint32_t bytesSentWindow   = 0;
uint32_t framesSentTotal   = 0;
uint32_t framesDroppedFail = 0;     // capture or send failures

// ===========================================================================
//  Camera bring-up
// ===========================================================================
bool initCamera() {
    camera_config_t config = {};
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0       = Y2_GPIO_NUM;
    config.pin_d1       = Y3_GPIO_NUM;
    config.pin_d2       = Y4_GPIO_NUM;
    config.pin_d3       = Y5_GPIO_NUM;
    config.pin_d4       = Y6_GPIO_NUM;
    config.pin_d5       = Y7_GPIO_NUM;
    config.pin_d6       = Y8_GPIO_NUM;
    config.pin_d7       = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;            // 20 MHz - max stable XCLK
    config.pixel_format = PIXFORMAT_JPEG;      // hardware-encoded JPEG

    // Use PSRAM for double-buffering if available — required for any size
    // above QVGA. If PSRAM init fails we fall back to QVGA in DRAM.
    if (psramFound()) {
        config.frame_size   = CAM_FRAME_SIZE;
        config.jpeg_quality = CAM_JPEG_QUALITY;
        config.fb_count     = CAM_FB_COUNT;
        config.fb_location  = CAMERA_FB_IN_PSRAM;
        config.grab_mode    = CAMERA_GRAB_LATEST;   // always serve newest frame
    } else {
        Serial.println(F("[cam] PSRAM not found - falling back to QVGA / 1 buffer"));
        config.frame_size   = FRAMESIZE_QVGA;
        config.jpeg_quality = 15;
        config.fb_count     = 1;
        config.fb_location  = CAMERA_FB_IN_DRAM;
        config.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;
    }

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[cam] esp_camera_init failed: 0x%x\n", err);
        return false;
    }

    // Sensor-side tweaks for daylight tele-op. Adjust to taste — these can
    // also be changed at runtime via the OV2640 driver if you add a UI hook.
    sensor_t* s = esp_camera_sensor_get();
    if (s) {
        s->set_brightness(s, 0);    // -2 .. 2
        s->set_contrast(s,   0);    // -2 .. 2
        s->set_saturation(s, 0);    // -2 .. 2
        s->set_whitebal(s,   1);
        s->set_awb_gain(s,   1);
        s->set_exposure_ctrl(s, 1);
        s->set_aec2(s,       1);
        s->set_gain_ctrl(s,  1);
        s->set_hmirror(s,    0);
        s->set_vflip(s,      0);
    }

    Serial.println(F("[cam] camera initialised"));
    return true;
}

// ===========================================================================
//  WebSocket plumbing
// ===========================================================================
void sendRegistration() {
    String reg = "{\"type\":\"camera\"";
    if (CAMERA_TOKEN && CAMERA_TOKEN[0] != '\0') {
        reg += ",\"token\":\"";
        reg += CAMERA_TOKEN;
        reg += "\"";
    }
    reg += "}";
    wsClient.send(reg);
    Serial.println(F("[ws] registration sent"));
}

void onWsMessage(WebsocketsMessage message) {
    // Cameras don't take commands — log and ignore so a misrouted controller
    // message doesn't silently confuse the firmware.
    const String& data = message.data();
    if (data.length() == 0) return;
    Serial.print(F("[ws] ignored inbound msg: "));
    Serial.println(data.length() <= 80 ? data : data.substring(0, 80) + "...");
}

void onWsEvent(WebsocketsEvent event, String /*data*/) {
    switch (event) {
        case WebsocketsEvent::ConnectionOpened:
            Serial.println(F("[ws] connected"));
            wsConnected = true;
            digitalWrite(PIN_STATUS_LED, LED_ON);
            sendRegistration();
            break;

        case WebsocketsEvent::ConnectionClosed:
            Serial.println(F("[ws] disconnected"));
            wsConnected = false;
            digitalWrite(PIN_STATUS_LED, LED_OFF);
            nextWsRetryMs = millis() + WS_RETRY_MS;
            break;

        case WebsocketsEvent::GotPing:
        case WebsocketsEvent::GotPong:
            break;
    }
}

void connectWebSocket() {
    if (wsConnected) return;
    if ((int32_t)(millis() - nextWsRetryMs) < 0) return;

    Serial.print(F("[ws] connecting to "));
    Serial.println(WS_SERVER_URL);

    wsClient.setCACert(ROOT_CA_PEM);
    wsClient.onMessage(onWsMessage);
    wsClient.onEvent(onWsEvent);

    bool ok = wsClient.connect(WS_SERVER_URL);
    if (!ok) {
        Serial.println(F("[ws] connect failed, will retry"));
        nextWsRetryMs = millis() + WS_RETRY_MS;
    }
}

// ===========================================================================
//  Wi-Fi (blocking on boot, non-blocking on resume)
// ===========================================================================
void connectWiFiBlocking() {
    Serial.printf("[wifi] connecting to %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);                  // critical: sleep adds 100+ms jitter
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED &&
           millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
        delay(250);
        Serial.print('.');
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print(F("[wifi] up, IP="));
        Serial.println(WiFi.localIP());
    } else {
        Serial.println(F("[wifi] connect timeout - will retry in loop"));
    }
}

void ensureWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;
    static uint32_t nextRetry = 0;
    if ((int32_t)(millis() - nextRetry) < 0) return;
    Serial.println(F("[wifi] reconnecting"));
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    nextRetry = millis() + 3000;
}

// ===========================================================================
//  Frame capture + send
// ===========================================================================
// Returns true on success. On failure, increments the drop counter so we
// can spot a sick sensor in the periodic status print.
bool captureAndSendFrame() {
    if (!wsConnected || !cameraReady) return false;

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println(F("[cam] fb_get returned null"));
        framesDroppedFail++;
        return false;
    }

    bool sent = false;
    if (fb->format == PIXFORMAT_JPEG && fb->len > 0) {
        // sendBinary copies into an internal WS frame buffer, so it's safe
        // to release fb immediately after the call returns.
        sent = wsClient.sendBinary(reinterpret_cast<const char*>(fb->buf), fb->len);
    } else {
        Serial.println(F("[cam] unexpected non-JPEG framebuffer"));
    }

    if (sent) {
        framesSentWindow++;
        framesSentTotal++;
        bytesSentWindow += fb->len;
    } else {
        framesDroppedFail++;
    }

    esp_camera_fb_return(fb);
    return sent;
}

// ===========================================================================
//  Status print (rate-limited)
// ===========================================================================
void maybePrintStatus() {
    uint32_t now = millis();
    if (now - lastStatusMs < STATUS_PRINT_MS) return;

    float windowSec = (now - lastStatusMs) / 1000.0f;
    float fps  = windowSec > 0 ? framesSentWindow / windowSec : 0;
    float kbps = windowSec > 0 ? (bytesSentWindow * 8.0f / 1000.0f) / windowSec : 0;

    Serial.printf(
        "[stat] wifi=%d ws=%d rssi=%ddBm fps=%.1f kbps=%.0f total=%u drops=%u heap=%u\n",
        WiFi.status() == WL_CONNECTED, wsConnected, WiFi.RSSI(),
        fps, kbps, framesSentTotal, framesDroppedFail, ESP.getFreeHeap()
    );

    framesSentWindow = 0;
    bytesSentWindow  = 0;
    lastStatusMs     = now;
}

// ===========================================================================
//  Arduino entry points
// ===========================================================================
void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println();
    Serial.println(F("=== ESP32-CAM video streamer ==="));

    pinMode(PIN_STATUS_LED, OUTPUT);
    digitalWrite(PIN_STATUS_LED, LED_OFF);

    cameraReady = initCamera();
    if (!cameraReady) {
        Serial.println(F("[fatal] camera init failed - rebooting in 5s"));
        delay(5000);
        ESP.restart();
    }

    connectWiFiBlocking();
    lastStatusMs = millis();
}

void loop() {
    ensureWiFi();

    if (WiFi.status() == WL_CONNECTED) {
        connectWebSocket();
    }

    // Pump the WS state machine — pings, incoming frames, close handshakes.
    // MUST be called frequently or the link drops on idle.
    wsClient.poll();

    // Frame pacing. We use a wall-clock cap (not delay) so other tasks
    // (poll, Wi-Fi housekeeping) still run during the gap.
    if (wsConnected) {
        uint32_t now = millis();
        if (now - lastFrameMs >= MIN_FRAME_INTERVAL_MS) {
            lastFrameMs = now;
            captureAndSendFrame();
        }
    }

    maybePrintStatus();
}
