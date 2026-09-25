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
