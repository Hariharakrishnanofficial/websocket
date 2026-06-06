/*
 * ============================================================================
 *  ESP32 Robot Client - WebSocket Firmware (Catalyst AppSail-ready)
 * ============================================================================
 *  Connects to Wi-Fi, opens a (TLS) WebSocket to the Catalyst AppSail relay,
 *  registers itself as a "robot", and executes single-character motion
 *  commands received from the Controller.
 *
 *  Protocol (server -> ESP32):
 *      F = moveForward()
 *      B = moveBackward()
 *      L = turnLeft()
 *      R = turnRight()
 *      S = stopRobot()
 *
 *  Safety:
 *      A watchdog calls stopRobot() if no command is received within
 *      COMMAND_TIMEOUT_MS (default 500 ms).
 *
 *  Required libraries (install via Arduino IDE Library Manager):
 *      - ArduinoWebsockets   by Gil Maimon  (>= 0.5.3 for WSS)
 *      - (WiFi.h + WiFiClientSecure are bundled with the ESP32 board package)
 *
 *  Board: any ESP32 dev module.
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoWebsockets.h>

using namespace websockets;

// ---------------------------------------------------------------------------
// LIBRARY REQUIREMENT (CRITICAL)
// ---------------------------------------------------------------------------
//   ArduinoWebsockets by Gil Maimon  >= 0.5.4   (older versions silently
//   fail wss:// against SNI-routed reverse proxies such as *.zcodeusers.in
//   and *.catalystappsail.in). Update via:  Library Manager -> search
//   "ArduinoWebsockets" -> Update.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// USER CONFIG  ---  EDIT THESE
// ---------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

/*  Catalyst AppSail URL after deployment, e.g.:
 *      wss://appsail-XXXXXXXXXX.development.catalystserverless.com/ws
 *
 *  For local testing against `appsail-nodejs/index.js` (no TLS):
 *      ws://192.168.1.50:9000/ws
 */
// Production AppSail endpoint (IN data center, Development env).
// IMPORTANT: scheme MUST be wss:// (not https://) and path MUST be /ws
// NOTE: AppSail edge currently strips WebSocket Upgrade headers in dev.
// Using zcodeusers tunnel which proxies WS correctly. Switch to AppSail URL
// once the platform-side WS support is enabled on this project.
const char* WS_SERVER_URL = "wss://krishnanhari-b8hfpk0w-3003.zcodeusers.in/ws";

/*  When connecting via wss:// we either:
 *    (a) set USE_INSECURE_TLS = true to skip certificate validation (fastest
 *        to get running, fine for hobby / private networks), or
 *    (b) embed the server's root CA in ROOT_CA_PEM and keep
 *        USE_INSECURE_TLS = false (recommended for production).
 */
const bool USE_INSECURE_TLS = true;

// Paste the appropriate root CA chain here if USE_INSECURE_TLS = false.
// (Catalyst currently fronts AppSail with publicly-trusted certs.)
const char* ROOT_CA_PEM = R"PEM(
-----BEGIN CERTIFICATE-----
...replace with the Catalyst edge CA chain...
-----END CERTIFICATE-----
)PEM";

// ---------------------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------------------
const uint32_t COMMAND_TIMEOUT_MS = 500;    // watchdog threshold
const uint32_t WIFI_RETRY_MS      = 3000;
const uint32_t WS_RETRY_MS        = 2000;
const uint32_t STATUS_PRINT_MS    = 5000;

// ---------------------------------------------------------------------------
// Motor / GPIO pin map (PLACEHOLDERS - wire as appropriate for your driver)
// ---------------------------------------------------------------------------
const int PIN_LEFT_FWD   = 25;
const int PIN_LEFT_REV   = 26;
const int PIN_RIGHT_FWD  = 32;
const int PIN_RIGHT_REV  = 33;
const int PIN_STATUS_LED = 2;  // on-board LED on most ESP32 dev boards

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
WebsocketsClient wsClient;

volatile uint32_t lastCommandMs    = 0;
bool              wsConnected      = false;
uint32_t          nextWsRetryMs    = 0;
uint32_t          lastStatusMs     = 0;
bool              isMoving         = false;

// ===========================================================================
//  MOTION PRIMITIVES  (placeholders - replace with your motor driver code)
// ===========================================================================
void driveMotors(int leftFwd, int leftRev, int rightFwd, int rightRev) {
    digitalWrite(PIN_LEFT_FWD,  leftFwd);
    digitalWrite(PIN_LEFT_REV,  leftRev);
    digitalWrite(PIN_RIGHT_FWD, rightFwd);
    digitalWrite(PIN_RIGHT_REV, rightRev);
}

void moveForward()  { Serial.println("[motion] FORWARD");  driveMotors(HIGH, LOW,  HIGH, LOW);  isMoving = true; }
void moveBackward() { Serial.println("[motion] BACKWARD"); driveMotors(LOW,  HIGH, LOW,  HIGH); isMoving = true; }
void turnLeft()     { Serial.println("[motion] LEFT");     driveMotors(LOW,  HIGH, HIGH, LOW);  isMoving = true; }
void turnRight()    { Serial.println("[motion] RIGHT");    driveMotors(HIGH, LOW,  LOW,  HIGH); isMoving = true; }
void stopRobot() {
    if (isMoving) Serial.println("[motion] STOP");
    driveMotors(LOW, LOW, LOW, LOW);
    isMoving = false;
}

// ===========================================================================
//  Command dispatch
// ===========================================================================
void handleCommand(char cmd) {
    lastCommandMs = millis();        // refresh watchdog
    switch (cmd) {
        case 'F': moveForward();  break;
        case 'B': moveBackward(); break;
        case 'L': turnLeft();     break;
        case 'R': turnRight();    break;
        case 'S': stopRobot();    break;
        default:
            Serial.printf("[cmd] ignored: 0x%02X\n", cmd);
            break;
    }
}

// ===========================================================================
//  WebSocket event handlers
// ===========================================================================
void onWsMessage(WebsocketsMessage message) {
    const String& data = message.data();
    if (data.length() == 0) return;

    if (data.length() == 1) {
        handleCommand(data.charAt(0));
        return;
    }

    // Allow JSON fallback such as {"cmd":"F"} or server JSON envelopes.
    int idx = data.indexOf("\"cmd\"");
    if (idx >= 0) {
        int q = data.indexOf('"', data.indexOf(':', idx) + 1);
        if (q > 0 && q + 1 < (int)data.length()) {
            handleCommand(data.charAt(q + 1));
            return;
        }
    }
    Serial.print("[ws] non-command msg: ");
    Serial.println(data);
}

void onWsEvent(WebsocketsEvent event, String /*data*/) {
    switch (event) {
        case WebsocketsEvent::ConnectionOpened:
            Serial.println("[ws] connected");
            wsConnected = true;
            digitalWrite(PIN_STATUS_LED, HIGH);
            wsClient.send("{\"type\":\"robot\"}");   // register
            lastCommandMs = millis();                // arm watchdog
            break;

        case WebsocketsEvent::ConnectionClosed:
            Serial.println("[ws] disconnected");
            wsConnected = false;
            digitalWrite(PIN_STATUS_LED, LOW);
            stopRobot();                              // SAFETY
            nextWsRetryMs = millis() + WS_RETRY_MS;
            break;

        case WebsocketsEvent::GotPing:
        case WebsocketsEvent::GotPong:
            break;
    }
}

// ===========================================================================
//  Connectivity helpers
// ===========================================================================
void connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;

    Serial.printf("[wifi] connecting to '%s' ...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);             // reduces command latency
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
        delay(250);
        Serial.print('.');
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[wifi] connected, IP=");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("[wifi] FAILED - will retry");
        delay(WIFI_RETRY_MS);
    }
}

// Parse "wss://host[:port]/path" -> host, port, path.
// Returns true on success.
static bool parseWsUrl(const String& url, String& host, uint16_t& port, String& path, bool& secure) {
    secure = url.startsWith("wss://");
    int schemeLen = secure ? 6 : (url.startsWith("ws://") ? 5 : 0);
    if (!schemeLen) return false;
    int pathIdx = url.indexOf('/', schemeLen);
    String hostPort = (pathIdx < 0) ? url.substring(schemeLen)
                                    : url.substring(schemeLen, pathIdx);
    path = (pathIdx < 0) ? "/" : url.substring(pathIdx);
    int colon = hostPort.indexOf(':');
    if (colon < 0) {
        host = hostPort;
        port = secure ? 443 : 80;
    } else {
        host = hostPort.substring(0, colon);
        port = hostPort.substring(colon + 1).toInt();
    }
    return host.length() > 0;
}

// Backoff (linear up to 30s) to avoid hammering when something is wrong.
static uint32_t wsBackoffMs = WS_RETRY_MS;

void connectWebSocket() {
    if (wsConnected) return;
    if (millis() < nextWsRetryMs) return;

    // -------- Pre-flight diagnostics: DNS + raw TCP --------
    String host, path;
    uint16_t port;
    bool secure;
    if (!parseWsUrl(String(WS_SERVER_URL), host, port, path, secure)) {
        Serial.println("[ws] bad URL");
        nextWsRetryMs = millis() + 60000;
        return;
    }

    Serial.printf("[ws] heap=%u  resolving %s ...\n",
                  (unsigned)ESP.getFreeHeap(), host.c_str());
    IPAddress ip;
    if (!WiFi.hostByName(host.c_str(), ip)) {
        Serial.println("[ws] DNS FAILED");
        nextWsRetryMs = millis() + wsBackoffMs;
        wsBackoffMs = min<uint32_t>(wsBackoffMs * 2, 30000);
        return;
    }
    Serial.printf("[ws] DNS ok -> %s   raw TCP probe ...\n", ip.toString().c_str());

    // Raw TCP probe to ensure the router/firewall isn't blocking 443.
    WiFiClient probe;
    probe.setTimeout(5);
    if (!probe.connect(ip, port)) {
        Serial.printf("[ws] TCP %u BLOCKED (router/firewall?)\n", port);
        probe.stop();
        nextWsRetryMs = millis() + wsBackoffMs;
        wsBackoffMs = min<uint32_t>(wsBackoffMs * 2, 30000);
        return;
    }
    probe.stop();
    Serial.println("[ws] TCP ok");

    // -------- TLS config (MUST be re-applied before every connect) --------
    if (secure) {
        if (USE_INSECURE_TLS) {
            wsClient.setInsecure();
        } else {
            wsClient.setCACert(ROOT_CA_PEM);
        }
    }

    Serial.printf("[ws] connecting -> %s\n", WS_SERVER_URL);
    bool ok = wsClient.connect(WS_SERVER_URL);
    if (!ok) {
        Serial.printf("[ws] connect() FAILED (heap left=%u) -- retry in %ums\n",
                      (unsigned)ESP.getFreeHeap(), (unsigned)wsBackoffMs);
        nextWsRetryMs = millis() + wsBackoffMs;
        wsBackoffMs = min<uint32_t>(wsBackoffMs * 2, 30000);
        return;
    }
    // Success: reset backoff so future drops reconnect fast.
    wsBackoffMs = WS_RETRY_MS;
    // onWsEvent(ConnectionOpened) finalises the registration
}

// ===========================================================================
//  Arduino entry points
// ===========================================================================
void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println("\n=== ESP32 Robot booting ===");

    pinMode(PIN_LEFT_FWD,   OUTPUT);
    pinMode(PIN_LEFT_REV,   OUTPUT);
    pinMode(PIN_RIGHT_FWD,  OUTPUT);
    pinMode(PIN_RIGHT_REV,  OUTPUT);
    pinMode(PIN_STATUS_LED, OUTPUT);
    stopRobot();

    wsClient.onMessage(onWsMessage);
    wsClient.onEvent(onWsEvent);

    connectWiFi();
    connectWebSocket();
    lastCommandMs = millis();
}

void loop() {
    // 1) maintain Wi-Fi
    if (WiFi.status() != WL_CONNECTED) {
        if (wsConnected) { wsConnected = false; stopRobot(); }
        connectWiFi();
        return;
    }

    // 2) maintain WebSocket
    if (!wsConnected) connectWebSocket();

    // 3) pump library
    wsClient.poll();

    // 4) WATCHDOG -- if no command for COMMAND_TIMEOUT_MS, stop the robot
    if (isMoving && (millis() - lastCommandMs > COMMAND_TIMEOUT_MS)) {
        Serial.println("[wdt] command timeout - stopping");
        stopRobot();
    }

    // 5) periodic heartbeat log
    if (millis() - lastStatusMs > STATUS_PRINT_MS) {
        lastStatusMs = millis();
        Serial.printf("[stat] wifi=%d ws=%d moving=%d rssi=%d\n",
                      WiFi.status() == WL_CONNECTED, wsConnected,
                      isMoving, WiFi.RSSI());
    }
}
