#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_BNO055.h>
#include "SPIFFS.h"
#include "AudioFileSourceSPIFFS.h"
#include "AudioFileSourceBuffer.h"
#include "AudioGeneratorMP3.h"
#include "AudioOutputI2S.h"

// ================= CONFIG =================
const char* ssid = "Aryan";          // YOUR WIFI NAME
const char* password = "12345678";   // YOUR WIFI PASSWORD

// IP ADDRESS OF YOUR LAPTOP (Running server.js)
const char* server_host = "172.20.10.5";

// --- I2S PIN CONFIGURATION (Speaker) ---
#define I2S_BCLK      5    // Bit Clock
#define I2S_LRC       6    // Word Select / Left-Right Clock
#define I2S_DOUT      7    // Data Out (to amplifier)

// ================= GLOBALS =================
WebSocketsClient webSocket;
Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);

// Audio objects
AudioGeneratorMP3 *mp3 = nullptr;
AudioFileSourceSPIFFS *file = nullptr;
AudioFileSourceBuffer *buff = nullptr;
AudioOutputI2S *out = nullptr;

// Audio state
bool isPlaying = false;
bool shouldPlay = false;

// Motion tracking (for reset baseline)
float lastRoll = 0;
float lastPitch = 0;
bool initialized = false;

// ================= AUDIO FUNCTIONS =================
void startAlertSound() {
    if (!shouldPlay) {
        shouldPlay = true;
        Serial.println(">>> Starting alert sound! <<<");
    }
}

void stopAlertSound() {
    shouldPlay = false;
    if (mp3 && mp3->isRunning()) {
        mp3->stop();
    }
    isPlaying = false;
    Serial.println(">>> Alert sound stopped <<<");
}

void handleAudio() {
    if (shouldPlay) {
        if (mp3 && mp3->isRunning()) {
            // Keep feeding the decoder
            if (!mp3->loop()) {
                mp3->stop();
                isPlaying = false;
                // Restart if still in alert mode
                if (shouldPlay) {
                    if (buff) delete buff;
                    if (file) delete file;
                    file = new AudioFileSourceSPIFFS("/alert.mp3");
                    buff = new AudioFileSourceBuffer(file, 8192);
                    mp3->begin(buff, out);
                    isPlaying = true;
                }
            }
        } else if (!isPlaying) {
            // Start playing
            if (buff) delete buff;
            if (file) delete file;
            file = new AudioFileSourceSPIFFS("/alert.mp3");
            buff = new AudioFileSourceBuffer(file, 8192);
            if (file->isOpen()) {
                mp3->begin(buff, out);
                isPlaying = true;
            }
        }
    }
}

// ================= WEBSOCKET EVENTS =================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.println("[WS] Disconnected!");
            stopAlertSound();
            break;
        case WStype_CONNECTED:
            Serial.println("[WS] Connected to Node.js Server!");
            break;
        case WStype_TEXT:
            Serial.printf("[WS] Message: %s\n", payload);
            // Check for reset command to stop sound (handles both JSON and plain text)
            if (strstr((char*)payload, "reset") != NULL) {
                Serial.println(">>> RESET received - stopping alarm! <<<");
                stopAlertSound();
                // Reset the baseline so small movements don't re-trigger
                sensors_event_t event;
                bno.getEvent(&event);
                lastRoll = event.orientation.y;
                lastPitch = event.orientation.z;
            }
            break;
    }
}

// ================= SETUP =================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n=== Chope Sensor + Audio ===");

    // 1. Initialize SPIFFS filesystem
    if (!SPIFFS.begin(true)) {
        Serial.println("ERROR: SPIFFS mount failed!");
    } else {
        Serial.println("SPIFFS mounted.");
        File root = SPIFFS.open("/");
        File f = root.openNextFile();
        while (f) {
            Serial.printf("  %s (%d bytes)\n", f.name(), f.size());
            f = root.openNextFile();
        }
    }

    // 2. Set up I2S audio output
    out = new AudioOutputI2S();
    out->SetPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
    out->SetBitsPerSample(16);
    out->SetChannels(1);
    out->SetRate(44100);
    out->SetGain(0.4);
    out->SetOutputModeMono(true);

    // 3. Create MP3 decoder
    mp3 = new AudioGeneratorMP3();

    // 4. Setup BNO055 Sensor
    Serial.println("Initializing BNO055...");
    Wire.begin(8, 9); // SDA/SCL pins
    if (!bno.begin()) {
        Serial.println("ERROR: BNO055 not detected! Check wiring:");
        Serial.println("  - SDA -> GPIO 8");
        Serial.println("  - SCL -> GPIO 9");
        Serial.println("  - VIN -> 3.3V");
        Serial.println("  - GND -> GND");
    } else {
        Serial.println("BNO055 OK!");
        bno.setExtCrystalUse(true);
    }

    // 2. WiFi
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
    Serial.println("\nWiFi Connected.");

    // 3. Connect to Laptop Server (Plain WebSocket on port 3001)
    webSocket.begin(server_host, 3001, "/");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

// ================= LOOP =================
void loop() {
    webSocket.loop();  // Keep WebSocket alive
    handleAudio();     // Handle MP3 playback

    static unsigned long lastSend = 0;
    if (millis() - lastSend > 100) { // Send at 10Hz (Fast enough)
        lastSend = millis();

        sensors_event_t event;
        bno.getEvent(&event);

        float currentRoll = event.orientation.y;
        float currentPitch = event.orientation.z;
        float currentHeading = event.orientation.x;

        // Print angles to Serial Monitor
        Serial.print("Heading: ");
        Serial.print(currentHeading);
        Serial.print(", Roll: ");
        Serial.print(currentRoll);
        Serial.print(", Pitch: ");
        Serial.println(currentPitch);

        // Check if roll or pitch changed by more than 5 degrees
        float rollChange = abs(currentRoll - lastRoll);
        float pitchChange = abs(currentPitch - lastPitch);
        
        if (!initialized) {
            // First reading, just store values
            lastRoll = currentRoll;
            lastPitch = currentPitch;
            initialized = true;
        } else if (rollChange >= 5.0 || pitchChange >= 5.0) {
            // Threshold exceeded - send alert!
            Serial.println(">>> ALERT: Movement detected! <<<");
            
            // Start playing alert sound
            startAlertSound();
            
            // Prepare JSON for alert
            StaticJsonDocument<256> doc;
            doc["type"] = "alert";
            doc["heading"] = currentHeading;
            doc["roll"] = currentRoll;
            doc["pitch"] = currentPitch;
            doc["rollChange"] = rollChange;
            doc["pitchChange"] = pitchChange;

            char jsonString[256];
            serializeJson(doc, jsonString);

            // Send alert to server (plain JSON)
            webSocket.sendTXT(jsonString);

            // Update last values
            lastRoll = currentRoll;
            lastPitch = currentPitch;
        }

        // Always send sensor data (for live display)
        StaticJsonDocument<200> sensorDoc;
        sensorDoc["type"] = "sensorData";
        sensorDoc["heading"] = currentHeading;
        sensorDoc["roll"] = currentRoll;
        sensorDoc["pitch"] = currentPitch;

        char sensorJson[200];
        serializeJson(sensorDoc, sensorJson);

        // Send sensor data (plain JSON)
        webSocket.sendTXT(sensorJson);
    }
}
