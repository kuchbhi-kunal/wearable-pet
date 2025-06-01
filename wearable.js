
function send(state) {
  const buttons = document.querySelectorAll(".btn");
  const currentButton = event.target;

  currentButton.classList.add("loading");
  currentButton.disabled = true;

  fetch(`/emotion?state=${state}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then((data) => {
      console.log("Emotion set:", data);
      showNotification(`Emotion changed to state ${state}`, "success");
    })
    .catch((error) => {
      console.error("Error setting emotion:", error);
      showNotification("Failed to change emotion", "error");
    })
    .finally(() => {
      currentButton.classList.remove("loading");
      currentButton.disabled = false;
    });
}

function light() {
  const lightBtn = document.getElementById("lightBtn");
  lightBtn.classList.add("loading");
  lightBtn.disabled = true;

  fetch("/readinglight")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then((data) => {
      console.log("Reading light response:", data);

      if (data.includes("ON")) {
        lightBtn.style.background = "linear-gradient(45deg, #ff9800, #f57c00)";
        lightBtn.innerHTML = "Light OFF";
        showNotification("Reading light turned ON", "success");
      } else {
        lightBtn.style.background = "linear-gradient(45deg, #FFEB3B, #FBC02D)";
        lightBtn.innerHTML = "Reading Light";
        showNotification("Reading light turned OFF", "success");
      }
    })
    .catch((error) => {
      console.error("Error toggling reading light:", error);
      showNotification("Failed to toggle reading light", "error");
    })
    .finally(() => {
      lightBtn.classList.remove("loading");
      lightBtn.disabled = false;
    });
}

function toggleManual() {
  const manualBtn = document.getElementById("manualBtn");
  manualBtn.classList.add("loading");
  manualBtn.disabled = true;

  fetch("/manual")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then((data) => {
      console.log("Manual mode response:", data);

      if (data.includes("ON")) {
        manualBtn.style.background = "linear-gradient(45deg, #ff5722, #d84315)";
        manualBtn.innerHTML = "Auto Mode";
        enableManualControls();
        showNotification("Manual mode enabled", "info");
      } else {
        manualBtn.style.background = "linear-gradient(45deg, #2196F3, #1976D2)";
        manualBtn.innerHTML = "Manual Mode";
        disableManualControls();
        showNotification("Auto mode enabled", "info");
      }
    })
    .catch((error) => {
      console.error("Error toggling manual mode:", error);
      showNotification("Failed to toggle manual mode", "error");
    })
    .finally(() => {
      manualBtn.classList.remove("loading");
      manualBtn.disabled = false;
    });
}

function enableManualControls() {
  const emotionButtons = document.querySelectorAll(
    '.btn:not(.manual):not([onclick*="light()"])'
  );
  emotionButtons.forEach((btn) => {
    btn.style.opacity = "1";
    btn.disabled = false;
  });
}

function disableManualControls() {
  const emotionButtons = document.querySelectorAll(
    '.btn:not(.manual):not([onclick*="light()"])'
  );
  emotionButtons.forEach((btn) => {
    btn.style.opacity = "0.6";
    btn.disabled = false;
  });
}

function showNotification(message, type = "info") {
  const existingNotifications = document.querySelectorAll(".notification");
  existingNotifications.forEach((notification) => notification.remove());

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  Object.assign(notification.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    padding: "12px 20px",
    borderRadius: "6px",
    color: "white",
    fontWeight: "bold",
    zIndex: "1000",
    opacity: "0",
    transform: "translateX(100%)",
    transition: "all 0.3s ease",
  });

  switch (type) {
    case "success":
      notification.style.background =
        "linear-gradient(45deg, #4CAF50, #45a049)";
      break;
    case "error":
      notification.style.background =
        "linear-gradient(45deg, #F44336, #D32F2F)";
      break;
    case "info":
      notification.style.background =
        "linear-gradient(45deg, #2196F3, #1976D2)";
      break;
    default:
      notification.style.background =
        "linear-gradient(45deg, #9E9E9E, #757575)";
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = "1";
    notification.style.transform = "translateX(0)";
  }, 10);

  setTimeout(() => {
    notification.style.opacity = "0";
    notification.style.transform = "translateX(100%)";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

document.addEventListener("keydown", function (event) {
  if (event.target.tagName !== "INPUT" && event.target.tagName !== "TEXTAREA") {
    switch (event.key) {
      case "0":
        send(0);
        break; // Neutral
      case "1":
        send(1);
        break; // Angry
      case "2":
        send(2);
        break; // Surprised
      case "3":
        send(3);
        break; // Sad
      case "4":
        send(4);
        break; // Suspicious
      case "5":
        send(5);
        break; // Left
      case "6":
        send(6);
        break; // Right
      case "7":
        send(7);
        break; // Up
      case "8":
        send(8);
        break; // Down
      case "9":
        send(9);
        break; // Sleepy
      case "l":
      case "L":
        light();
        break; // Reading light
      case "m":
      case "M":
        toggleManual();
        break; // Manual mode
    }
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const body = document.body;
  const shortcutHint = document.createElement("div");
  shortcutHint.innerHTML =
    "Keyboard shortcuts: 0-9 for emotions, L for light, M for manual mode";
  shortcutHint.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        opacity: 0.7;
        z-index: 100;
    `;
  body.appendChild(shortcutHint);

  setTimeout(() => {
    shortcutHint.style.opacity = "0";
    setTimeout(() => shortcutHint.remove(), 1000);
  }, 5000);

  console.log("ESP32 Wearable Control Panel loaded successfully!");
});
