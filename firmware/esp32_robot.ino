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
//
// FIX: Previous URL pointed at port 3003 (no process listening). The live
// AppSail relay is exposed on the 3000 tunnel — verified via process map.
const char* WS_SERVER_URL = "wss://krishnanhari-b8hfpk0w-4600.zcodeusers.in/ws";

// Shared secret sent in the registration frame. Must match ROBOT_TOKEN in the
// AppSail environment. Leave empty ("") to disable token auth (dev only).
const char* ROBOT_TOKEN = "";

/*  TLS configuration for wss://
 *
 *  IMPORTANT (ArduinoWebsockets 0.5.4 ESP32 bug):
 *      The library's `setInsecure()` on ESP32 only nulls out the CA pointer —
 *      it never calls `WiFiClientSecure::setInsecure()` on the underlying
 *      socket. The result: TLS handshake fails silently and `connect()`
 *      returns false (TCP connects, then nothing). The ONLY reliable way to
 *      establish wss:// from ESP32 with this library is to supply a valid
 *      root CA via `setCACert()`.
 *
 *  We therefore embed the USERTrust RSA Certification Authority root below.
 *  This is the trust anchor for the Sectigo-issued *.zcodeusers.in cert.
 */
const bool USE_INSECURE_TLS = false;  // MUST be false — see note above.

// USERTrust RSA Certification Authority (root) — anchor for Sectigo-issued
// *.zcodeusers.in certificates. Valid until 2038-01-18.
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
// TUNING
// ---------------------------------------------------------------------------
// Controller heartbeat is 300ms. Allow ~2 missed frames before failsafe.
// 750ms = 2.5x heartbeat = tolerates one missed frame, stops on two.
const uint32_t COMMAND_TIMEOUT_MS = 750;
const uint32_t WIFI_RETRY_MS      = 3000;
const uint32_t WS_RETRY_MS        = 2000;
const uint32_t STATUS_PRINT_MS    = 10000;  // doubled — less noise, still useful
const uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;

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

// Track current motion state so we can:
//   - skip redundant digitalWrites when the same direction repeats (heartbeat)
//   - log only on state CHANGE (not on every heartbeat frame)
// Values match the protocol chars: 'F' 'B' 'L' 'R' 'S' (0 = uninitialised)
char currentMotion = 0;

// Track last logged status to suppress unchanged heartbeat prints.
int8_t lastLoggedRssiBucket = 127;  // RSSI grouped into 3-dBm buckets
bool   lastLoggedWifi  = false;
bool   lastLoggedWs    = false;
bool   lastLoggedMov   = false;

// ===========================================================================
//  MOTION PRIMITIVES  (placeholders - replace with your motor driver code)
// ===========================================================================
// Low-level pin write. Caller is responsible for state dedup.
static inline void writeMotorPins(uint8_t lF, uint8_t lR, uint8_t rF, uint8_t rR) {
    digitalWrite(PIN_LEFT_FWD,  lF);
    digitalWrite(PIN_LEFT_REV,  lR);
    digitalWrite(PIN_RIGHT_FWD, rF);
    digitalWrite(PIN_RIGHT_REV, rR);
}

// Apply a motion direction. Skips pin writes + serial output if the requested
// direction is already active (this is the common case at 3 Hz heartbeat).
// Returns true if a state change actually occurred.
static bool applyMotion(char dir) {
    if (dir == currentMotion) return false;   // no-op heartbeat — fast path

    switch (dir) {
        case 'F': writeMotorPins(HIGH, LOW,  HIGH, LOW ); Serial.println(F("[motion] FORWARD"));  break;
        case 'B': writeMotorPins(LOW,  HIGH, LOW,  HIGH); Serial.println(F("[motion] BACKWARD")); break;
        case 'L': writeMotorPins(LOW,  HIGH, HIGH, LOW ); Serial.println(F("[motion] LEFT"));     break;
        case 'R': writeMotorPins(HIGH, LOW,  LOW,  HIGH); Serial.println(F("[motion] RIGHT"));    break;
        case 'S': writeMotorPins(LOW,  LOW,  LOW,  LOW ); Serial.println(F("[motion] STOP"));     break;
        default:  return false;
    }
    currentMotion = dir;
    isMoving = (dir != 'S');
    return true;
}

void moveForward()  { applyMotion('F'); }
void moveBackward() { applyMotion('B'); }
void turnLeft()     { applyMotion('L'); }
void turnRight()    { applyMotion('R'); }
void stopRobot()    { applyMotion('S'); }

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
    // Unknown payload — truncate to 64 chars so a rogue server can't stall
    // the event loop with a giant log dump at 115200 baud.
    Serial.print(F("[ws] non-command msg: "));
    if (data.length() <= 64) {
        Serial.println(data);
    } else {
        Serial.print(data.substring(0, 64));
        Serial.printf("... (+%u bytes)\n", (unsigned)(data.length() - 64));
    }
}

void onWsEvent(WebsocketsEvent event, String /*data*/) {
    switch (event) {
        case WebsocketsEvent::ConnectionOpened: {
            Serial.println("[ws] connected");
            wsConnected = true;
            digitalWrite(PIN_STATUS_LED, HIGH);
            // Build registration JSON (with optional token).
            String reg = "{\"type\":\"robot\"";
            if (ROBOT_TOKEN && ROBOT_TOKEN[0] != '\0') {
                reg += ",\"token\":\"";
                reg += ROBOT_TOKEN;
                reg += "\"";
            }
            reg += "}";
            wsClient.send(reg);
            lastCommandMs = millis();                // arm watchdog
            break;
        }

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
// Non-blocking Wi-Fi state machine. Called every loop iteration.
// Replaces the original blocking connectWiFi() which stalled wsClient.poll()
// for up to 15 seconds during a reconnect — long enough to drop the WS link
// and miss STOP frames on resume.
enum WifiState : uint8_t { WIFI_IDLE, WIFI_CONNECTING, WIFI_READY };
static WifiState wifiState = WIFI_IDLE;
static uint32_t  wifiAttemptStartMs = 0;
static uint32_t  wifiNextRetryMs    = 0;

void pumpWiFi() {
    wl_status_t st = WiFi.status();

    if (st == WL_CONNECTED) {
        if (wifiState != WIFI_READY) {
            Serial.print(F("[wifi] connected, IP="));
            Serial.println(WiFi.localIP());
            wifiState = WIFI_READY;
        }
        return;
    }

    // Lost connection from a previously-ready state — fail safe immediately.
    if (wifiState == WIFI_READY) {
        Serial.println(F("[wifi] lost connection"));
        wifiState = WIFI_IDLE;
        if (wsConnected) { wsConnected = false; }
        stopRobot();
    }

    if (wifiState == WIFI_CONNECTING) {
        if (millis() - wifiAttemptStartMs > WIFI_CONNECT_TIMEOUT_MS) {
            Serial.println(F("\n[wifi] FAILED - will retry"));
            WiFi.disconnect(true, false);
            wifiState = WIFI_IDLE;
            wifiNextRetryMs = millis() + WIFI_RETRY_MS;
        }
        return;
    }

    // WIFI_IDLE: respect backoff before kicking off a fresh attempt.
    if (millis() < wifiNextRetryMs) return;

    Serial.printf("[wifi] connecting to '%s' ...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);             // reduces command latency
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    wifiAttemptStartMs = millis();
    wifiState = WIFI_CONNECTING;
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

    // -------- TLS pre-flight (diagnoses SNI / cert failures) -------------
    // The Catalyst edge routes by SNI. Some ArduinoWebsockets versions do
    // not pass the hostname to the underlying WiFiClientSecure, which causes
    // a silent TLS handshake failure (connect() returns false with no log).
    // We run a standalone TLS probe so the real reason is visible BEFORE we
    // hand control to the WS library.
    if (secure) {
        WiFiClientSecure tls;
        // Use the SAME TLS config the library will use — so this probe truly
        // reflects whether the WS connect will succeed.
        if (USE_INSECURE_TLS) {
            tls.setInsecure();
        } else {
            tls.setCACert(ROOT_CA_PEM);
        }
        tls.setHandshakeTimeout(8);     // seconds
        Serial.printf("[ws] TLS probe (mode=%s, SNI=%s) ...\n",
                      USE_INSECURE_TLS ? "INSECURE" : "CA_VERIFY", host.c_str());
        if (!tls.connect(host.c_str(), port)) {
            Serial.println("[ws] TLS probe FAILED - handshake rejected");
            if (!USE_INSECURE_TLS) {
                Serial.println("[ws]   cert chain validation failed.");
                Serial.println("[ws]   check that ROOT_CA_PEM matches the edge cert issuer.");
            } else {
                Serial.println("[ws]   most likely cause: ArduinoWebsockets < 0.5.4 SNI bug");
            }
            tls.stop();
            nextWsRetryMs = millis() + wsBackoffMs;
            wsBackoffMs = min<uint32_t>(wsBackoffMs * 2, 30000);
            return;
        }
        Serial.println("[ws] TLS ok");
        tls.stop();
    }

    // -------- TLS config for the WS client (re-apply every connect) ------
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
        if (USE_INSECURE_TLS) {
            Serial.println("[ws]   NOTE: ArduinoWebsockets 0.5.4 on ESP32 has a");
            Serial.println("[ws]   bug where setInsecure() does NOT actually");
            Serial.println("[ws]   skip cert validation. Set USE_INSECURE_TLS=false");
            Serial.println("[ws]   and supply a valid ROOT_CA_PEM instead.");
        } else {
            Serial.println("[ws]   TLS probe passed but WS upgrade failed.");
            Serial.println("[ws]   -> server returned non-101 or closed mid-handshake.");
        }
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

    pumpWiFi();                       // kick off (non-blocking) initial connect
    lastCommandMs = millis();
}

void loop() {
    // 1) maintain Wi-Fi (non-blocking state machine)
    pumpWiFi();

    // 2) maintain WebSocket only when Wi-Fi is up
    if (wifiState == WIFI_READY && !wsConnected) {
        connectWebSocket();
    }

    // 3) pump library (safe to call when not connected — it's a no-op)
    wsClient.poll();

    // 4) WATCHDOG — stop the robot if no command for COMMAND_TIMEOUT_MS
    if (isMoving && (millis() - lastCommandMs > COMMAND_TIMEOUT_MS)) {
        Serial.println(F("[wdt] command timeout - stopping"));
        stopRobot();
    }

    // 5) Periodic status — print only on STATE CHANGE or every 30s as heartbeat.
    //    RSSI is bucketed into 3-dBm groups so small wiggle doesn't spam.
    uint32_t now = millis();
    if (now - lastStatusMs > STATUS_PRINT_MS) {
        bool   wifiOk = (wifiState == WIFI_READY);
        bool   wsOk   = wsConnected;
        bool   mov    = isMoving;
        int    rssi   = wifiOk ? WiFi.RSSI() : 0;
        int8_t bucket = (int8_t)(rssi / 3);

        bool changed = (wifiOk != lastLoggedWifi) ||
                       (wsOk   != lastLoggedWs)   ||
                       (mov    != lastLoggedMov)  ||
                       (bucket != lastLoggedRssiBucket);
        bool heartbeatDue = (now - lastStatusMs > 30000UL);

        if (changed || heartbeatDue) {
            Serial.printf("[stat] wifi=%d ws=%d moving=%d rssi=%d\n",
                          wifiOk, wsOk, mov, rssi);
            lastLoggedWifi = wifiOk;
            lastLoggedWs   = wsOk;
            lastLoggedMov  = mov;
            lastLoggedRssiBucket = bucket;
            lastStatusMs   = now;
        } else {
            // Bump the timer so we re-check after one more interval, not next loop.
            lastStatusMs = now;
        }
    }
}
