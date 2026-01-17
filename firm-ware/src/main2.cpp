#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>


// --- LIBRARIES FOR SENSOR ---
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>


// --- LIBRARIES FOR AUDIO ---
#include "SPIFFS.h"
#include "AudioFileSourceSPIFFS.h"
#include "AudioFileSourceBuffer.h"
#include "AudioGeneratorMP3.h"
#include "AudioOutputI2S.h"


// ================= PIN DEFINITIONS =================
// Audio Pins (MAX98357A)
#define I2S_BCLK      5
#define I2S_LRC       6
#define I2S_DOUT      7


// Sensor Pins (I2C)
#define I2C_SDA       8
#define I2C_SCL       9


// ================= GLOBAL OBJECTS =================
// Sensor Object
Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);


// Audio Objects
AudioGeneratorMP3 *mp3;
AudioFileSourceSPIFFS *file;
AudioFileSourceBuffer *buff;
AudioOutputI2S *out;


// ================= TIMING VARIABLES =================
// We use this to replace delay(500)
unsigned long lastSensorReadTime = 0;
const unsigned long SENSOR_INTERVAL = 200; // Read sensor every 200ms


// ================= SETUP =================
void setup() {
 Serial.begin(115200);
 delay(1000); // Give serial time to start
 Serial.println("\n=== SYSTEM STARTING: AUDIO + SENSOR ===\n");


 // ------------------------------------------
 // 1. SETUP FILESYSTEM (For MP3)
 // ------------------------------------------
 if (!SPIFFS.begin(true)) {
   Serial.println("CRITICAL ERROR: SPIFFS mount failed!");
   while (1) delay(100);
 }
 Serial.println(">> SPIFFS Mounted.");


 // ------------------------------------------
 // 2. SETUP AUDIO
 // ------------------------------------------
 out = new AudioOutputI2S();
 out->SetPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
 out->SetBitsPerSample(16);
 out->SetChannels(1);
 out->SetRate(44100);
 out->SetGain(0.4); // Volume (0.0 to 4.0)
 out->SetOutputModeMono(true);


 file = new AudioFileSourceSPIFFS("/singaporean.mp3");
  // Important: The buffer helps the audio survive while we read the sensor!
 // We use 8192 bytes (8KB) to be safe.
 buff = new AudioFileSourceBuffer(file, 8192);


 if (!file->isOpen()) {
   Serial.println("ERROR: Could not open /singaporean.mp3");
 }


 mp3 = new AudioGeneratorMP3();
 mp3->begin(buff, out);
 Serial.println(">> Audio Initialized.");


 // ------------------------------------------
 // 3. SETUP SENSOR
 // ------------------------------------------
 // Initialize I2C with your specific pins
 pinMode(I2C_SDA, INPUT_PULLUP);
 pinMode(I2C_SCL, INPUT_PULLUP);
 Wire.begin(I2C_SDA, I2C_SCL);
 Wire.setClock(100000); // Standard I2C speed


 if (!bno.begin()) {
   Serial.println("WARNING: No BNO055 detected! (Check wiring)");
   // We do NOT stop here with while(1), so audio can still work if sensor fails.
 } else {
   bno.setExtCrystalUse(true);
   Serial.println(">> BNO055 Sensor Detected.");
 }


 Serial.println("\n=== SYSTEM READY ===\n");
}


// ================= MAIN LOOP =================
void loop() {
 // -----------------------------------------------------
 // TASK A: AUDIO PLAYBACK (MUST RUN FAST)
 // -----------------------------------------------------
 if (mp3->isRunning()) {
   if (!mp3->loop()) {
     mp3->stop();
     Serial.println("Song finished.");
   }
 } else {
   // Restart logic
   Serial.println("Restarting song in 1 sec...");
   delay(1000); // Short blocking delay is okay here since music stopped
  
   // Clean up old objects to free memory
   delete buff;
   delete file;
  
   // Re-create objects
   file = new AudioFileSourceSPIFFS("/singaporean.mp3");
   buff = new AudioFileSourceBuffer(file, 8192);
   mp3->begin(buff, out);
   Serial.println("Playing again...");
 }
 // -----------------------------------------------------
 // TASK B: SENSOR READING (RUNS ON TIMER)
 // -----------------------------------------------------
 // We check if "SENSOR_INTERVAL" milliseconds have passed
 if (millis() - lastSensorReadTime > SENSOR_INTERVAL) {
   lastSensorReadTime = millis();
  
   // Get sensor data
   sensors_event_t event;
   bno.getEvent(&event);


   // Print data nicely
   Serial.print("[SENSOR] Heading: ");
   Serial.print(event.orientation.x, 1);
   Serial.print("\tPitch: ");
   Serial.print(event.orientation.z, 1);
   Serial.print("\tRoll: ");
   Serial.println(event.orientation.y, 1);
 }
}
