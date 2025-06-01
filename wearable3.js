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
  const toggleSwitch = document.getElementById("modeToggle");
  const toggleContainer = document.getElementById("toggleContainer");

  toggleContainer.classList.add("loading");
  toggleSwitch.disabled = true;

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
        // Manual mode is now ON
        toggleSwitch.checked = true;
        toggleContainer.classList.add("manual-active");
        enableManualControls();
        showNotification("Manual mode enabled", "info");
      } else {
        // Auto mode is now ON
        toggleSwitch.checked = false;
        toggleContainer.classList.remove("manual-active");
        disableManualControls();
        showNotification("Auto mode enabled", "info");
      }
    })
    .catch((error) => {
      console.error("Error toggling manual mode:", error);
      showNotification("Failed to toggle manual mode", "error");
    })
    .finally(() => {
      toggleContainer.classList.remove("loading");
      toggleSwitch.disabled = false;
    });
}

function enableManualControls() {
  const emotionButtons = document.querySelectorAll(
    '.btn:not(.manual):not([onclick*="light()"])'
  );
  emotionButtons.forEach((btn) => {
    btn.style.opacity = "1";
    btn.disabled = false;
    btn.style.pointerEvents = "auto";
  });
}

function disableManualControls() {
  const emotionButtons = document.querySelectorAll(
    '.btn:not(.manual):not([onclick*="light()"])'
  );
  emotionButtons.forEach((btn) => {
    btn.style.opacity = "0.4";
    btn.disabled = true;
    btn.style.pointerEvents = "none";
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
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
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
    "Keyboard shortcuts: 0-9 for emotions, L for light, M for manual/auto toggle";
  shortcutHint.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px 18px;
        border-radius: 25px;
        font-size: 13px;
        opacity: 0.8;
        z-index: 100;
        backdrop-filter: blur(5px);
        border: 1px solid rgba(255,255,255,0.1);
    `;
  body.appendChild(shortcutHint);

  setTimeout(() => {
    shortcutHint.style.opacity = "0";
    setTimeout(() => shortcutHint.remove(), 1000);
  }, 6000);

  // Initialize toggle state
  const toggleSwitch = document.getElementById("modeToggle");
  const toggleContainer = document.getElementById("toggleContainer");
  if (toggleSwitch && toggleContainer) {
    toggleSwitch.checked = false; // Start in auto mode
    toggleContainer.classList.remove("manual-active");
    disableManualControls();
  }

  console.log("ESP32 Wearable Control Panel loaded successfully!");
});
