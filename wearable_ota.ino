#include <U8g2lib.h>
#include <Wire.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <WebServer.h>
#include <Update.h>

// Initialize display - SH1106 or SSD1306 OLED 128x64
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE);

const char* ssid = "kunal";
const char* password = "kunal1234";

WebServer server(80);
// Device name
#define DEVICE_NAME "ESP32-Wearable"

enum EyeState {
  STATE_NEUTRAL,     // Normal, centered eyes
  STATE_ANGRY,       // Angled eyes, looking aggressive
  STATE_SURPRISED,   // Wide, round eyes
  STATE_SAD,         // Droopy, downward eyes
  STATE_SUSPICIOUS,  // Narrow, squinting eyes
  STATE_LEFT,        // Looking left
  STATE_RIGHT,       // Looking right
  STATE_UP,          // Looking up
  STATE_DOWN,        // Looking down
  STATE_SLEEPY,      // Half-closed eyes
  STATE_COUNT        // Used to count the number of states
};

const int screenWidth = 128;
const int screenHeight = 64;
const int eyeBaseWidth = 30;     // Base width of eye - increased size
const int eyeBaseHeight = 44;    // Base height of eye - increased size
const int eyeSpacing = 16;       // Space between eyes
const int blinkDuration = 220;   // Duration of blink in ms
const int transitionDuration = 150; // Duration of transition in ms

// Animation timing
unsigned long lastBlinkTime = 0;
unsigned long lastStateChangeTime = 0;
unsigned long transitionStartTime = 0;
unsigned long lastNetworkCheckTime = 0;
const int networkCheckInterval = 2000; // Check network every 2 seconds if disconnected
bool readingLightOn = false;
bool manualMode = false;


// Eye state
EyeState currentEyeState = STATE_NEUTRAL;
EyeState targetEyeState = STATE_NEUTRAL;
bool isBlinking = false;
byte blinkState = 0;  // 0 = open, 1 = half-closed, 2 = closed, 3 = half-open
bool isTransitioning = false;
float transitionProgress = 1.0; // 0.0 to 1.0

// Eye dimension variables for smooth transitions
float leftEyeWidth, leftEyeHeight, rightEyeWidth, rightEyeHeight;
float leftOffsetX, leftOffsetY, rightOffsetX, rightOffsetY;
float leftTargetWidth, leftTargetHeight, rightTargetWidth, rightTargetHeight;
float leftTargetOffsetX, leftTargetOffsetY, rightTargetOffsetX, rightTargetOffsetY;
float leftAngle, rightAngle, leftTargetAngle, rightTargetAngle;

// Center coordinates
int centerX, centerY, leftEyeX, rightEyeX, eyeY;

// Behavior parameters - updated values for better randomization
const int neutralStateProbability = 70;    // 70% chance to return to neutral (increased)
const int minNeutralDuration = 4000;       // Longer minimum time in neutral (4-8 seconds)
const int maxNeutralDuration = 8000;       // Longer maximum time in neutral
const int minEmotionDuration = 1200;       // Minimum time for emotions (1.2-3 seconds)
const int maxEmotionDuration = 3000;       // Maximum time for emotions
const int emotionChangeProbability = 30;   // 30% chance for emotion vs 70% for look direction
const int blinkProbability = 70;           // 70% chance to blink at blink interval
const int minBlinkInterval = 2000;         // Min time between blinks (2-5 seconds)
const int maxBlinkInterval = 5000;         // Max time between blinks

// Flag to track if OTA update is in progress
bool otaInProgress = false;

// Variables for web update progress tracking
size_t updateSize = 0;
size_t updateProgress = 0;

// Array to track recently used states to avoid repetition
EyeState recentStates[3] = {STATE_NEUTRAL, STATE_NEUTRAL, STATE_NEUTRAL};
int recentStateIndex = 0;

// Forward declarations
void updateEyeDimensions(EyeState state, float &leftW, float &leftH, float &rightW, float &rightH,
                         float &leftX, float &leftY, float &rightX, float &rightY,
                         float &leftA, float &rightA);
void drawFilledEllipse(int x0, int y0, int width, int height, float angle);
bool wasStateRecentlyUsed(EyeState state);
void recordStateUse(EyeState state);
void setupWiFi();
void setupOTA();
void setupWebServer();
void handleRoot();
void handleEmotion();
void drawStatusScreen(const String& line1, const String& line2 = "", const String& line3 = "");

void setup() {
  // Initialize serial for debugging
  Serial.begin(115200);
  Serial.println("Booting...");

  // Initialize display
  u8g2.begin();

  // Display startup screen
  drawStatusScreen("ESP32 Wearable", "Starting...");

  // Seed random number generator with a truly random analog value
  randomSeed(analogRead(0));

  // Calculate initial positions
  centerX = screenWidth / 2;
  centerY = screenHeight / 2;
  leftEyeX = centerX - eyeSpacing / 2 - eyeBaseWidth / 2;
  rightEyeX = centerX + eyeSpacing / 2 + eyeBaseWidth / 2;
  eyeY = centerY;

  // Initialize eye dimensions with neutral state
  leftEyeWidth = eyeBaseWidth;
  leftEyeHeight = eyeBaseHeight;
  rightEyeWidth = eyeBaseWidth;
  rightEyeHeight = eyeBaseHeight;
  leftOffsetX = 0;
  leftOffsetY = 0;
  rightOffsetX = 0;
  rightOffsetY = 0;
  leftAngle = 0;
  rightAngle = 0;

  // Initial state
  setEyeState(STATE_NEUTRAL);

  // Initialize last blink time to trigger a blink soon after startup
  lastBlinkTime = millis() - random(1000, 2000);

  // Setup WiFi, OTA and Web Server
  setupWiFi();
  setupOTA();
  setupWebServer();

  Serial.println("Setup complete!");
}

void loop() {
  unsigned long currentTime = millis();

  // Handle OTA updates and Web Server
  ArduinoOTA.handle();
  server.handleClient();

  // Skip eye animation if OTA is in progress
  if (otaInProgress) {
    return;
  }

  // Reconnect WiFi if disconnected (every 2 seconds)
  if (WiFi.status() != WL_CONNECTED &&
      currentTime - lastNetworkCheckTime > networkCheckInterval) {
    Serial.println("WiFi disconnected, attempting to reconnect...");
    WiFi.reconnect();
    lastNetworkCheckTime = currentTime;
  }

  // Blinking logic - random intervals with probability
  if (!isBlinking && currentTime - lastBlinkTime > random(minBlinkInterval, maxBlinkInterval)) {
    if (random(100) < blinkProbability) { // 70% chance to blink
      isBlinking = true;
      blinkState = 1;
      lastBlinkTime = currentTime;
    } else {
      // Reset the timer even if it don't blink this time
      lastBlinkTime = currentTime;
    }
  }

  // Process blink animation
  if (isBlinking) {
    if (currentTime - lastBlinkTime > blinkDuration / 4) {
      blinkState++;
      if (blinkState > 3) {
        isBlinking = false;
        blinkState = 0;
      }
      lastBlinkTime = currentTime;
    }
  }

  // Handle transitions between states
  if (isTransitioning) {
    float progress = (float)(currentTime - transitionStartTime) / transitionDuration;
    if (progress >= 1.0) {
      // Transition complete
      progress = 1.0;
      isTransitioning = false;
      currentEyeState = targetEyeState;
    }

    // Interpolate between states
    transitionProgress = progress;
    leftEyeWidth = leftEyeWidth + (leftTargetWidth - leftEyeWidth) * progress;
    leftEyeHeight = leftEyeHeight + (leftTargetHeight - leftEyeHeight) * progress;
    rightEyeWidth = rightEyeWidth + (rightTargetWidth - rightEyeWidth) * progress;
    rightEyeHeight = rightEyeHeight + (rightTargetHeight - rightEyeHeight) * progress;
    leftOffsetX = leftOffsetX + (leftTargetOffsetX - leftOffsetX) * progress;
    leftOffsetY = leftOffsetY + (leftTargetOffsetY - leftOffsetY) * progress;
    rightOffsetX = rightOffsetX + (rightTargetOffsetX - rightOffsetX) * progress;
    rightOffsetY = rightOffsetY + (rightTargetOffsetY - rightOffsetY) * progress;
    leftAngle = leftAngle + (leftTargetAngle - leftAngle) * progress;
    rightAngle = rightAngle + (rightTargetAngle - rightAngle) * progress;
  }

 // State change logic with improved randomization
  if (!manualMode && !isTransitioning && currentTime - lastStateChangeTime >
      (currentEyeState == STATE_NEUTRAL ?
       random(minNeutralDuration, maxNeutralDuration) :
       random(minEmotionDuration, maxEmotionDuration))) {

    // Decide next state - increased favor for neutral state
    if (currentEyeState != STATE_NEUTRAL && random(100) < neutralStateProbability) {
      // Go back to neutral
      setEyeState(STATE_NEUTRAL);
    } else {
      // Choose a new random state that's not recently used
      EyeState newState;
      bool validState = false;

      while (!validState) {
        if (random(100) < emotionChangeProbability) {
          // Pick an emotion state (0-4)
          newState = (EyeState)random(5);
        } else {
          // Pick a directional state (5-9)
          newState = (EyeState)(random(5) + 5);
        }

        // Don't use the current state or recently used states
        if (newState != currentEyeState && !wasStateRecentlyUsed(newState)) {
          validState = true;
        }
      }

      setEyeState(newState);
      recordStateUse(newState);
    }

    lastStateChangeTime = currentTime;
  }

  // Draw the eyes based on current state
  drawEyes();

  // Small delay to control frame rate
  delay(16);  // ~60fps
}

// Setup WiFi Connection
void setupWiFi() {
  drawStatusScreen("Connecting to", ssid);
  delay(4000);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  // Wait for connection (with timeout)
  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startTime < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.print("Connected to ");
    Serial.println(ssid);
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP().toString());

    // Setup mDNS responder
    if (!MDNS.begin(DEVICE_NAME)) {
      Serial.println("Error setting up MDNS responder!");
    } else {
      Serial.println("mDNS responder started");
      MDNS.addService("http", "tcp", 80);
    }

    drawStatusScreen("Connected", "" + WiFi.localIP().toString());
    delay(3000);  // Show IP for 3 seconds
  } else {
    Serial.println("WiFi connection failed!");
    drawStatusScreen("Failed", "to connect", "Will retry...");
    delay(2000);
  }
  drawStatusScreen("Hi", "I am Blinky");
  delay(3500);
}

// Setup OTA Updates
void setupOTA() {
  // Port defaults to 3232
  // ArduinoOTA.setPort(3232);

  // Hostname defaults to esp3232-[MAC]
  ArduinoOTA.setHostname(DEVICE_NAME);

  // No authentication by default
  // ArduinoOTA.setPassword("admin");

  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else { // U_SPIFFS
      type = "filesystem";
    }
    // NOTE: if updating SPIFFS this would be the place to unmount SPIFFS using SPIFFS.end()
    Serial.println("Start updating " + type);
    otaInProgress = true;
    drawStatusScreen("Update", "Starting...");
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\nOTA update complete!");
    drawStatusScreen("Update", "complete.", "Restarting.");
    delay(1000);
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    unsigned int percentComplete = progress / (total / 100);
    Serial.printf("OTA Progress: %u%%\r", percentComplete);

    // Update the display with progress
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_9x15_tf);
    u8g2.drawStr(0, 15, "Updating");

    // Draw progress bar
    u8g2.drawFrame(0, 25, 128, 10);
    u8g2.drawBox(0, 25, (percentComplete * 128) / 100, 10);

    // Display percentage
    String percentStr = String(percentComplete) + "%";
    u8g2.drawStr(52, 50, percentStr.c_str());
    u8g2.sendBuffer();
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    String errorMsg;

    if (error == OTA_AUTH_ERROR) {
      errorMsg = "Auth Failed";
    } else if (error == OTA_BEGIN_ERROR) {
      errorMsg = "Begin Failed";
    } else if (error == OTA_CONNECT_ERROR) {
      errorMsg = "Connect Failed";
    } else if (error == OTA_RECEIVE_ERROR) {
      errorMsg = "Receive Failed";
    } else if (error == OTA_END_ERROR) {
      errorMsg = "End Failed";
    }

    Serial.println(errorMsg);
    drawStatusScreen("OTA Error", errorMsg);
    delay(2000);
    otaInProgress = false;
  });

  ArduinoOTA.begin();
  Serial.println("OTA ready");
}

// Setup Web Server
void setupWebServer() {
  // Define routes
  server.on("/", HTTP_GET, handleRoot);
  server.on("/emotion", HTTP_GET, handleEmotion);
  server.on("/readinglight", HTTP_GET, handleReadingLight);
  server.on("/manual", HTTP_GET, handleManualMode);
  server.begin();
  Serial.println("Web server started");

}

// Web Server Route Handlers
void handleRoot() {
  String html = "<!DOCTYPE html><html lang='en'><head>";
  html += "<meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>ESP32 Wearable Control Panel</title>";

  // Link to external CSS hosted on GitHub via jsDelivr CDN
  html += "<link rel='stylesheet' href='https://blinky.kuchbhikunal.com/wearable.css'>";

  html += "</head><body>";

  // Hero image section
  html += "<div class='hero-image' style='width: 100%; margin-top: 3rem; margin-bottom: 3rem;'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet/hero.svg' style='width: 100%;'>";
  html += "</div>";

  // Toggle switch with SVG icons
  html += "<div class='toggle-container' id='toggleContainer'>";

  // Auto icon - using external SVG file
  html += "<div class='toggle-icon auto' onclick='setAutoMode()'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/auto.svg' alt='Auto Mode'>";
  html += "</div>";

  // Toggle switch
  html += "<label class='toggle-switch'>";
  html += "<input type='checkbox' id='modeToggle' onchange='toggleManual()'>";
  html += "<span class='slider'></span>";
  html += "</label>";

  // Manual icon - using external SVG file
  html += "<div class='toggle-icon manual' onclick='setManualMode()'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/manual.svg' alt='Manual Mode'>";
  html += "</div>";

  html += "</div>";

  // Updated grid with emotion icons
  html += "<div class='grid' id='emotionGrid'>";

  // Emotion buttons with icons
  html += "<button class='emotion-btn' data-state='0' onclick='send(0)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/neutral.svg' alt='Neutral'>";
  html += "<span>Neutral</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='1' onclick='send(1)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/angry.svg' alt='Angry'>";
  html += "<span>Angry</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='2' onclick='send(2)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/surprised.svg' alt='Surprised'>";
  html += "<span>Surprised</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='3' onclick='send(3)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/sad.svg' alt='Sad'>";
  html += "<span>Sad</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='4' onclick='send(4)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/suspicious.svg' alt='Suspicious'>";
  html += "<span>Suspicious</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='5' onclick='send(5)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/left.svg' alt='Left'>";
  html += "<span>Left</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='6' onclick='send(6)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/right.svg' alt='Right'>";
  html += "<span>Right</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='7' onclick='send(7)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/up.svg' alt='Up'>";
  html += "<span>Up</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='8' onclick='send(8)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/down.svg' alt='Down'>";
  html += "<span>Down</span>";
  html += "</button>";

  html += "<button class='emotion-btn' data-state='9' onclick='send(9)'>";
  html += "<img src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/sleepy.svg' alt='Sleepy'>";
  html += "<span>Sleepy</span>";
  html += "</button>";

  // Reading light button (keeping the original style)
  html += "<button class='btn light-btn' onclick='light()' id='lightBtn'>Reading Light</button>";

  html += "</div>";

  // Link to external JavaScript hosted on GitHub via jsDelivr CDN
  html += "<script src='https://cdn.jsdelivr.net/gh/kuchbhi-kunal/wearable-pet@main/wearable.js'></script>";

  html += "</body></html>";

  server.send(200, "text/html", html);
}


void handleEmotion() {
  if (server.hasArg("state")) {
    int stateValue = server.arg("state").toInt();
    if (stateValue >= 0 && stateValue < STATE_COUNT) {
      setEyeState((EyeState)stateValue);
      server.send(200, "text/plain", "Emotion set to " + String(stateValue));
    } else {
      server.send(400, "text/plain", "Invalid state value");
    }
  } else {
    server.send(400, "text/plain", "Missing state parameter");
  }
}

void handleReadingLight() {
  readingLightOn = !readingLightOn; // Toggle the reading light

  if (readingLightOn) {
    server.send(200, "text/plain", "Reading light ON");
  } else {
    server.send(200, "text/plain", "Reading light OFF");
  }
}

void handleManualMode() {
  manualMode = !manualMode; // Toggle manual mode

  if (manualMode) {
    server.send(200, "text/plain", "Manual mode ON");
  } else {
    server.send(200, "text/plain", "Manual mode OFF");
    // Reset to neutral when exiting manual mode
    setEyeState(STATE_NEUTRAL);
  }
}

// Utility function to display status on the OLED
void drawStatusScreen(const String& line1, const String& line2, const String& line3) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_9x15_tf);

  // First line (centered)
  int width = u8g2.getStrWidth(line1.c_str());
  u8g2.drawStr((screenWidth - width) / 2, 15, line1.c_str());

  // Second line (centered if provided)
  if (line2.length() > 0) {
    width = u8g2.getStrWidth(line2.c_str());
    u8g2.drawStr((screenWidth - width) / 2, 35, line2.c_str());
  }

  // Third line (centered if provided)
  if (line3.length() > 0) {
    width = u8g2.getStrWidth(line3.c_str());
    u8g2.drawStr((screenWidth - width) / 2, 55, line3.c_str());
  }

  u8g2.sendBuffer();
}

// Check if a state was recently used
bool wasStateRecentlyUsed(EyeState state) {
  for (int i = 0; i < 3; i++) {
    if (recentStates[i] == state) {
      return true;
    }
  }
  return false;
}

// Record state usage to avoid repetition
void recordStateUse(EyeState state) {
  recentStates[recentStateIndex] = state;
  recentStateIndex = (recentStateIndex + 1) % 3;
}

void setEyeState(EyeState newState) {
  // Skip if already transitioning or same state
  if (isTransitioning || newState == currentEyeState) {
    return;
  }

  // Set up transition
  targetEyeState = newState;
  isTransitioning = true;
  transitionStartTime = millis();
  transitionProgress = 0.0;

  // Calculate target dimensions
  updateEyeDimensions(
    newState,
    leftTargetWidth, leftTargetHeight,
    rightTargetWidth, rightTargetHeight,
    leftTargetOffsetX, leftTargetOffsetY,
    rightTargetOffsetX, rightTargetOffsetY,
    leftTargetAngle, rightTargetAngle
  );
}

void updateEyeDimensions(EyeState state, float &leftW, float &leftH, float &rightW, float &rightH,
                         float &leftX, float &leftY, float &rightX, float &rightY,
                         float &leftA, float &rightA) {
  // Set default dimensions
  leftW = eyeBaseWidth;
  leftH = eyeBaseHeight;
  rightW = eyeBaseWidth;
  rightH = eyeBaseHeight;
  leftX = 0;
  leftY = 0;
  rightX = 0;
  rightY = 0;
  leftA = 0;
  rightA = 0;

  // Apply state-specific transformations - more dramatic emotional changes
  switch (state) {
    case STATE_ANGRY:
      // Angry eyes - angled inward and narrowed
      leftW = eyeBaseWidth * 0.7;
      leftH = eyeBaseHeight * 0.7;
      rightW = eyeBaseWidth * 0.7;
      rightH = eyeBaseHeight * 0.7;
      leftX = -5;
      rightX = 5;
      leftY = -2;
      rightY = -2;
      leftA = -0.5;  // Angle in radians (~30 degrees inward)
      rightA = 0.5;
      break;

    case STATE_SURPRISED:
      // Surprised - wide, round eyes
      leftW = eyeBaseWidth * 1.4;
      leftH = eyeBaseWidth * 1.4;  // Round shape
      rightW = eyeBaseWidth * 1.4;
      rightH = eyeBaseWidth * 1.4;
      leftY = -5;
      rightY = -5;
      break;

    case STATE_SAD:
      // Sad - droopy eyes
      leftW = eyeBaseWidth * 0.9;
      leftH = eyeBaseHeight * 0.7;
      rightW = eyeBaseWidth * 0.9;
      rightH = eyeBaseHeight * 0.7;
      leftY = 8;
      rightY = 8;
      leftA = 0.3;  // Outer corners drooping
      rightA = -0.3;
      break;

    case STATE_SUSPICIOUS:
      // Suspicious - one eyebrow raised
      leftW = eyeBaseWidth * 0.75;
      leftH = eyeBaseHeight * 0.6;
      rightW = eyeBaseWidth * 0.9;
      rightH = eyeBaseHeight * 0.9;
      leftY = -5;
      rightY = 3;
      leftA = 0.2;
      break;

    case STATE_LEFT:
      // Looking left - improved positioning
      // Left eye (smaller)
      leftW = eyeBaseWidth * 0.5;    // Slightly larger than before (was 0.4)
      leftH = eyeBaseHeight * 0.7;   // Slightly larger than before (was 0.6)
      leftX = -10;                   // Keep same position for smaller eye

      // Right eye (bigger)
      rightW = eyeBaseWidth * 0.8;   // Reduced width (was 1.2)
      rightH = eyeBaseHeight * 1.1;  // Slightly increased height
      rightX = -12;                   // Move closer to the smaller eye (was -4)
      break;

    case STATE_RIGHT:
      // Looking right - improved positioning
      // Left eye (bigger)
      leftW = eyeBaseWidth * 0.8;    // Reduced width (was 1.2)
      leftH = eyeBaseHeight * 1.1;   // Slightly increased height
      leftX = 12;                     // Move closer to the smaller eye (was 4)

      // Right eye (smaller)
      rightW = eyeBaseWidth * 0.5;   // Slightly larger than before (was 0.4)
      rightH = eyeBaseHeight * 0.7;  // Slightly larger than before (was 0.6)
      rightX = 10;                   // Keep same position for smaller eye
      break;

    case STATE_UP:
      // Looking up - more dramatic
      leftW = eyeBaseWidth * 0.9;
      leftH = eyeBaseHeight * 0.65;
      rightW = eyeBaseWidth * 0.9;
      rightH = eyeBaseHeight * 0.65;
      leftY = -12;
      rightY = -12;
      break;

    case STATE_DOWN:
      // Looking down - more dramatic
      leftW = eyeBaseWidth * 0.9;
      leftH = eyeBaseHeight * 0.65;
      rightW = eyeBaseWidth * 0.9;
      rightH = eyeBaseHeight * 0.65;
      leftY = 12;
      rightY = 12;
      break;

    case STATE_SLEEPY:
      // Sleepy - half-closed eyes
      leftW = eyeBaseWidth * 1.0;
      leftH = eyeBaseHeight * 0.45;
      rightW = eyeBaseWidth * 1.0;
      rightH = eyeBaseHeight * 0.45;
      leftY = 8;
      rightY = 8;
      break;

    case STATE_NEUTRAL:
    default:
      // Normal state - no changes
      break;
  }
}

void drawEyes() {
  // Skip drawing if OTA is in progress
  if (otaInProgress) {
    return;
  }

  u8g2.clearBuffer();

    // Check if reading light is on - if so, fill entire screen
    if (readingLightOn) {
      u8g2.setDrawColor(1);
      u8g2.drawBox(0, 0, screenWidth, screenHeight); // Fill entire screen
      u8g2.sendBuffer();
      return; // Exit early, don't draw eyes
    }

  // Calculate current eye openness based on blinking
  float opennessFactor = 1.0;
  if (isBlinking) {
    if (blinkState == 1) {      // Half-closing
      opennessFactor = 0.5;
    } else if (blinkState == 2) { // Fully closed
      opennessFactor = 0.1;
    } else {                    // Half-opening
      opennessFactor = 0.5;
    }
  }

  // Calculate actual eye dimensions including blink effect
  float leftCurrentHeight = leftEyeHeight * opennessFactor;
  float rightCurrentHeight = rightEyeHeight * opennessFactor;

  // Draw filled eyes
  u8g2.setDrawColor(1); // White fill

  // Draw left eye using our custom fill function
  drawFilledEllipse(
    leftEyeX + leftOffsetX,
    eyeY + leftOffsetY,
    leftEyeWidth,
    leftCurrentHeight,
    leftAngle
  );

  // Draw right eye using our custom fill function
  drawFilledEllipse(
    rightEyeX + rightOffsetX,
    eyeY + rightOffsetY,
    rightEyeWidth,
    rightCurrentHeight,
    rightAngle
  );

  u8g2.sendBuffer();
}

// Function to draw a properly filled ellipse with rotation
void drawFilledEllipse(int x0, int y0, int width, int height, float angle) {
  // Direct-draw algorithm for filled ellipse
  int a = width / 2;
  int b = height / 2;

  // Drawing with scanlines for perfect fill
  for (int y = -b; y <= b; y++) {
    // Calculate half-width of this scanline
    // Use the formula: x = a * sqrt(1 - (y/b)²)
    // But guard against division by zero or very small b
    float relY = (b > 1) ? (float)y / b : 0;
    int halfWidth = a * sqrt(1.0 - relY * relY);

    if (halfWidth > 0) { // Only draw if width is positive
      if (angle == 0) {
        // No rotation - simple horizontal line
        u8g2.drawHLine(x0 - halfWidth, y0 + y, halfWidth * 2);
      } else {
        // Rotated line
        float sinA = sin(angle);
        float cosA = cos(angle);

        // Calculate rotated endpoints
        int x1 = x0 + (-halfWidth * cosA - y * sinA);
        int y1 = y0 + (-halfWidth * sinA + y * cosA);
        int x2 = x0 + (halfWidth * cosA - y * sinA);
        int y2 = y0 + (halfWidth * sinA + y * cosA);

        // Draw the rotated line
        u8g2.drawLine(x1, y1, x2, y2);
      }
    }
  }
}