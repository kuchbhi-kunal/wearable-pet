#include <U8g2lib.h>
#include <Wire.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <Update.h> // Needed for OTA

// Initialize display - SH1106 or SSD1306 OLED 128x64
U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, /* reset=*/ U8X8_PIN_NONE);

// WiFi Credentials (Kept for OTA)
const char* ssid = "kunal";
const char* password = "kunal1234";

// Device name (Kept for OTA and mDNS)
#define DEVICE_NAME "ESP32-Wearable"

// --- Eye State Definition ---
enum EyeState {
  STATE_NEUTRAL,        // Normal, centered eyes
  STATE_ANGRY,          // Angled eyes, looking aggressive
  STATE_SURPRISED,      // Wide, round eyes
  STATE_SAD,            // Flat/sleepy look (used for sad in original)
  STATE_SUSPICIOUS,     // Narrow, squinting eyes
  STATE_LEFT,           // Looking left
  STATE_RIGHT,          // Looking right
  STATE_UP,             // Looking up
  STATE_DOWN,           // Looking down
  STATE_SLEEPY,         // Droopy/sad look (used for sleepy in original)
  STATE_HAPPY,          // Happy state (Smile/Squint)
  STATE_COUNT           // Used to count the number of states
};

// --- Display Constants ---
const int screenWidth = 128;
const int screenHeight = 64;
const int eyeBaseWidth = 30;   
const int eyeBaseHeight = 44;   
const int eyeSpacing = 16;     
const int blinkDuration = 220; 
const int transitionDuration = 150;

// --- Animation & Timing Variables ---
unsigned long lastBlinkTime = 0;
unsigned long lastStateChangeTime = 0;
unsigned long transitionStartTime = 0;
unsigned long lastNetworkCheckTime = 0;
const int networkCheckInterval = 2000;

// The minimal state machine relies on these variables
unsigned long happyStateEndTime = 0;
bool wasManualModeBeforeFeed = false; // Kept to safely handle temporary STATE_HAPPY exits

struct Star {
  int x, y, size;
};

Star happyStars[2]; 
int numActiveStars = 0;

// Eye state
EyeState currentEyeState = STATE_NEUTRAL;
EyeState targetEyeState = STATE_NEUTRAL;
bool isBlinking = false;
byte blinkState = 0; 
bool isTransitioning = false;
float transitionProgress = 1.0;

float leftEyeWidth, leftEyeHeight, rightEyeWidth, rightEyeHeight;
float leftOffsetX, leftOffsetY, rightOffsetX, rightOffsetY;
float leftTargetWidth, leftTargetHeight, rightTargetWidth, rightTargetHeight;
float leftTargetOffsetX, leftTargetOffsetY, rightTargetOffsetX, rightTargetOffsetY;
float leftAngle, rightAngle, leftTargetAngle, rightTargetAngle;

int centerX, centerY, leftEyeX, rightEyeX, eyeY;

// Auto-movement probabilities (Kept to ensure transitions happen)
const int neutralStateProbability = 70;   
const int minNeutralDuration = 4000;       
const int maxNeutralDuration = 8000;       
const int minEmotionDuration = 1200;       
const int maxEmotionDuration = 3000;       
const int emotionChangeProbability = 30;   
const int blinkProbability = 70;           
const int minBlinkInterval = 2000;         
const int maxBlinkInterval = 5000;         

bool otaInProgress = false;

EyeState recentStates[3] = {STATE_NEUTRAL, STATE_NEUTRAL, STATE_NEUTRAL};
int recentStateIndex = 0;

// Forward declarations
void updateEyeDimensions(EyeState state, float &leftW, float &leftH, float &rightW, float &rightH,
                         float &leftX, float &leftY, float &rightX, float &rightY,
                         float &leftA, float &rightA);
void drawFilledEllipse(int x0, int y0, int width, int height, float angle);
void drawStar(int x, int y, int size);

bool wasStateRecentlyUsed(EyeState state);
void recordStateUse(EyeState state);
void setupWiFi();
void setupOTA();
void drawStatusScreen(const String& line1, const String& line2 = "", const String& line3 = "");
void drawEyes(); // Forward declaration for drawEyes

void setup() {
  // Initialize serial for debugging
  Serial.begin(115200);
  Serial.println("Booting...");
  u8g2.begin();
  drawStatusScreen("ESP32 Wearable", "Starting...");
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
  lastStateChangeTime = millis();

  // Setup WiFi and OTA
  setupWiFi();
  setupOTA();

  Serial.println("Setup complete!");
}

void loop() {
  unsigned long currentTime = millis();

  // Handle OTA updates (MANDATORY)
  ArduinoOTA.handle();
 
  // Skip eye animation if OTA is in progress (MANDATORY)
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
    if (random(100) < blinkProbability) {
      isBlinking = true;
      blinkState = 1;
      lastBlinkTime = currentTime;
    } else {
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

  // State change logic (Automatic transitions)
  // Check if the current state is STATE_HAPPY (used temporarily) and its timer has expired
  if (happyStateEndTime > 0 && currentTime >= happyStateEndTime) {
    // This block handles the exit from a temporary happy state, ensuring clean return to neutral.
    // Since manualMode is removed, we default to setting the state back to NEUTRAL.
    setEyeState(STATE_NEUTRAL);
    happyStateEndTime = 0;
    Serial.println("Returned from happy state.");
  }


  if (!isTransitioning && currentTime - lastStateChangeTime >
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

        // Don't use the current state or recently used states, and not STATE_HAPPY
        if (newState != currentEyeState && !wasStateRecentlyUsed(newState) && newState != STATE_HAPPY) {
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
  delay(16);  // ~60fps
}

// --- Support Functions (OTA and WiFi) ---

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
    }

    drawStatusScreen("Connected", "" + WiFi.localIP().toString());
    delay(3000); 
  } else {
    Serial.println("WiFi connection failed!");
    drawStatusScreen("Failed", "to connect", "Will retry...");
    delay(2000);
  }
  drawStatusScreen("Hi", "I am Blinky");
  delay(3500);
}

void setupOTA() {
  ArduinoOTA.setHostname(DEVICE_NAME);

  ArduinoOTA.onStart([]() {
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
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

void drawStatusScreen(const String& line1, const String& line2, const String& line3) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_9x15_tf);

  int width = u8g2.getStrWidth(line1.c_str());
  u8g2.drawStr((screenWidth - width) / 2, 15, line1.c_str());

  if (line2.length() > 0) {
    width = u8g2.getStrWidth(line2.c_str());
    u8g2.drawStr((screenWidth - width) / 2, 35, line2.c_str());
  }

  if (line3.length() > 0) {
    width = u8g2.getStrWidth(line3.c_str());
    u8g2.drawStr((screenWidth - width) / 2, 55, line3.c_str());
  }

  u8g2.sendBuffer();
}

// --- Eye State & Drawing Functions (Core Transition Logic) ---

bool wasStateRecentlyUsed(EyeState state) {
  for (int i = 0; i < 3; i++) {
    if (recentStates[i] == state) {
      return true;
    }
  }
  return false;
}

void recordStateUse(EyeState state) {
  recentStates[recentStateIndex] = state;
  recentStateIndex = (recentStateIndex + 1) % 3;
}

void setEyeState(EyeState newState) {
  if (isTransitioning || newState == currentEyeState) {
    return;
  }

  targetEyeState = newState;
  isTransitioning = true;
  transitionStartTime = millis();
  transitionProgress = 0.0;

  updateEyeDimensions(
    newState,
    leftTargetWidth, leftTargetHeight,
    rightTargetWidth, rightTargetHeight,
    leftTargetOffsetX, leftTargetOffsetY,
    rightTargetOffsetX, rightTargetOffsetY,
    leftTargetAngle, rightTargetAngle
  );

  if (newState == STATE_HAPPY) {
    numActiveStars = 2; // Only two stars

    // Top-right, small star
    happyStars[0].x = 105;
    happyStars[0].y = 15;
    happyStars[0].size = 3;

    // Bottom-left, a little big star
    happyStars[1].x = 20;
    happyStars[1].y = 50;
    happyStars[1].size = 6;

    // Set happy state timer (used to force a return to neutral after a short time)
    happyStateEndTime = millis() + 3000;

  } else {
    numActiveStars = 0; // Clear stars when not in happy state
  }
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
      leftA = -0.5;  // Angle in radians (~30 degrees inward)
      rightA = 0.5;
      break;

    case STATE_SURPRISED:
      // Surprised - wide, round eyes
      leftW = eyeBaseWidth * 1.4;
      leftH = eyeBaseWidth * 1.4;  // Round shape
      rightW = eyeBaseWidth * 1.4;
      rightH = eyeBaseWidth * 1.4;
      leftY = -5;
      rightY = -5;
      break;

    case STATE_SLEEPY:
      // Sleepy - half-closed eyes (now represents droopy/sad look)
      leftW = eyeBaseWidth * 0.9;
      leftH = eyeBaseHeight * 0.7;
      rightW = eyeBaseWidth * 0.9;
      rightH = eyeBaseHeight * 0.7;
      leftY = 8;
      rightY = 8;
      leftA = 0.3;  // Outer corners drooping
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
      leftW = eyeBaseWidth * 0.5;   
      leftH = eyeBaseHeight * 0.7;   
      leftX = -10;                   

      rightW = eyeBaseWidth * 0.8;   
      rightH = eyeBaseHeight * 1.1; 
      rightX = -12;                 
      break;

    case STATE_RIGHT:
      // Looking right - improved positioning
      leftW = eyeBaseWidth * 0.8;   
      leftH = eyeBaseHeight * 1.1;   
      leftX = 12;                   

      rightW = eyeBaseWidth * 0.5;   
      rightH = eyeBaseHeight * 0.7; 
      rightX = 10;                   
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

    case STATE_SAD:
      // Sad (now represents half-closed/flat look)
      leftW = eyeBaseWidth * 1.0;
      leftH = eyeBaseHeight * 0.45;
      rightW = eyeBaseWidth * 1.0;
      rightH = eyeBaseHeight * 0.45;
      leftY = 8;
      rightY = 8;
      break;

    case STATE_HAPPY:
      // Happy - "crescent moon" or "smiling eye" effect
      leftW = eyeBaseWidth * 1.3;   
      leftH = eyeBaseHeight * 0.3; 
      rightW = eyeBaseWidth * 1.3;
      rightH = eyeBaseHeight * 0.3;

      leftY = -6;
      rightY = -6;

      leftX = -3;
      rightX = 3;

      leftA = -0.05;
      rightA = 0.05;
      break;

    case STATE_NEUTRAL:
    default:
      // Normal state - no changes
      break;
  }
}

// Function to draw a 4-sided star (diamond shape)
void drawStar(int x, int y, int size) {
  u8g2.setDrawColor(1); // Ensure stars are white
  // Draw a filled diamond shape
  u8g2.drawTriangle(x, y - size, x + size, y, x, y + size);
  u8g2.drawTriangle(x, y - size, x - size, y, x, y + size);
}

void drawEyes() {
  // Skip drawing if OTA is in progress
  if (otaInProgress) {
    return;
  }

  u8g2.clearBuffer();

  // Calculate current eye openness based on blinking
  float opennessFactor = 1.0;
  if (isBlinking) {
    if (blinkState == 1) {      // Half-closing
      opennessFactor = 0.5;
    } else if (blinkState == 2) { // Fully closed
      opennessFactor = 0.1;
    } else {                    // Half-opening
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

  if (currentEyeState == STATE_HAPPY) {
    u8g2.setDrawColor(1); // Ensure stars are white
    unsigned long currentTime = millis(); // Get current time for twinkling

    for (int i = 0; i < numActiveStars; i++) {
      // Twinkling effect: vary the size of the star
      float twinkleAmplitude = 2.0;
      float twinkleSpeed = 150.0;   
      float twinkleOffset = sin((float)currentTime / twinkleSpeed + i * 0.5) * twinkleAmplitude;

      // Ensure the size doesn't go below 1 or too small
      int currentStarSize = max(1, happyStars[i].size + (int)twinkleOffset);

      drawStar(happyStars[i].x, happyStars[i].y, currentStarSize);
    }
  }
  u8g2.sendBuffer();
}

void drawFilledEllipse(int x0, int y0, int width, int height, float angle) {
  int a = width / 2;
  int b = height / 2;

  for (int y = -b; y <= b; y++) {
    float relY = (b > 1) ? (float)y / b : 0;
    int halfWidth = a * sqrt(1.0 - relY * relY);

    if (halfWidth > 0) {
      if (angle == 0) {
        u8g2.drawHLine(x0 - halfWidth, y0 + y, halfWidth * 2);
      } else {
        float sinA = sin(angle);
        float cosA = cos(angle);

        int x1 = x0 + (-halfWidth * cosA - y * sinA);
        int y1 = y0 + (-halfWidth * sinA + y * cosA);
        int x2 = x0 + (halfWidth * cosA - y * sinA);
        int y2 = y0 + (halfWidth * sinA + y * cosA);
        u8g2.drawLine(x1, y1, x2, y2);
      }
    }
  }
}
