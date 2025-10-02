/*
  UUIDs used:
  Service: 4fafc201-1fb5-459e-8fcc-c5c9c331914b
  Characteristic: beb5483e-36e1-4688-b7f5-ea07361b26a8
*/

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

const int LED_PIN = 2;

bool ledIsOn = false;

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        std::string value = pCharacteristic->getValue();

        if (value.length() > 0) {
            uint8_t command = (uint8_t)value[0];

            Serial.print("Received command: ");
            Serial.println(command);

            if (command == 1) {
                digitalWrite(LED_PIN, HIGH);
                ledIsOn = true;
                Serial.println("LED ON");
            } else if (command == 0) {
                digitalWrite(LED_PIN, LOW);
                ledIsOn = false;
                Serial.println("LED OFF");
            }

            uint8_t stateValue[] = { (uint8_t)ledIsOn };
            pCharacteristic->setValue(stateValue, 1);
        }
    }
};

void setup() {
    Serial.begin(115200);
    Serial.println("Starting BLE Server...");

    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    BLEDevice::init("ESP32-LED-Control");

    BLEServer *pServer = BLEDevice::createServer();

    BLEService *pService = pServer->createService(SERVICE_UUID);

    BLECharacteristic *pCharacteristic = pService->createCharacteristic(
                                            CHARACTERISTIC_UUID,
                                            BLECharacteristic::PROPERTY_READ |
                                            BLECharacteristic::PROPERTY_WRITE
                                        );

    uint8_t initialValue[] = { 0 };
    pCharacteristic->setValue(initialValue, 1);

    pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

    pService->start();

    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    Serial.println("Advertising started. Waiting for client connection...");
}

void loop() {
    delay(100);
}
