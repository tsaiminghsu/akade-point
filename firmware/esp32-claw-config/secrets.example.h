#pragma once
// Copy to secrets.h (gitignored) and fill in. The claw machine setup page's
// 機台連線 dialog prints API_BASE and DEVICE_TOKEN for you when it issues a
// token.

#define WIFI_SSID "your-wifi"
#define WIFI_PASSWORD "your-password"

// Control Center origin, no trailing slash. An ESP32 cannot reach "localhost":
// against a dev server use this computer's LAN address, e.g.
// "http://192.168.1.20:3000".
#define API_BASE "https://your-control-center.example.com"

// The machine's board token (mt_...), shown once when it is issued.
#define DEVICE_TOKEN "mt_paste_the_token_here"

// Root CA for an https API_BASE. Amplify and ACM certificates chain to
// Amazon Root CA 1: https://www.amazontrust.com/repository/AmazonRootCA1.pem
// Paste the whole PEM between the markers.
static const char ROOT_CA[] = R"PEM(
)PEM";

// Only for bench testing an https server without its CA: skips certificate
// checks, so anyone on the network could impersonate the server.
// #define ALLOW_INSECURE_TLS

// ── Instant notices over MQTT (optional) ──
// With these set, the board hears about a saved config at once and pulls it,
// and only polls every 5 minutes as a safety net. Leave MQTT_URI empty to
// just poll every 30 s.
//
// This machine's id, shown in the 機台連線 dialog. It is the MQTT client id,
// the AWS IoT Thing name, and part of the topic claw/<id>/config.
#define MACHINE_ID ""
//   AWS IoT Core: "mqtts://<prefix>-ats.iot.<region>.amazonaws.com:8883"
//   Plain broker: "mqtt://192.168.1.20:1883" (npm run mqtt:dev, Mosquitto...)
#define MQTT_URI ""
// For AWS IoT: the Thing's certificate and private key (from
// create-keys-and-certificate). The server CA is ROOT_CA above; if your HTTPS
// server uses a different CA, add the broker's as MQTT_ROOT_CA:
//   static const char MQTT_CA_PEM[] = R"PEM(...)PEM";
//   #define MQTT_ROOT_CA MQTT_CA_PEM
static const char DEVICE_CERT[] = R"PEM(
)PEM";
static const char DEVICE_KEY[] = R"PEM(
)PEM";
