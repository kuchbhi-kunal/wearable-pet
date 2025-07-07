function send(state) {
  const buttons = document.querySelectorAll(".emotion-btn");
  const currentButton = event.target.closest(".emotion-btn");

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
        lightBtn.innerHTML = "Reading Light OFF"; // Update button text
      } else {
        lightBtn.style.background = ""; // Reset background
        lightBtn.innerHTML = "Reading Light ON"; // Update button text
      }
      showNotification(data, "success");
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

async function getPetStatus() {
  try {
    const response = await fetch("/status");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching pet status:", error);
    showNotification("Failed to get pet status", "error");
    return null;
  }
}

async function toggleManual() {
  const modeToggle = document.getElementById("modeToggle");
  const targetMode = modeToggle.checked ? "manual" : "auto"; // Check if it's attempting to switch to manual or auto

  // Check pet status only if attempting to switch TO manual mode
  if (targetMode === "manual") {
    const status = await getPetStatus();
    // Assuming STATE_SAD is 3 in the C++ enum
    const STATE_SAD = 3;
    const HUNGER_THRESHOLD = 20; // Example threshold, adjust as needed

    if (
      status &&
      status.currentEyeState === STATE_SAD &&
      status.hungerLevel <= HUNGER_THRESHOLD
    ) {
      showNotification("Pet is hungry and sad, feed pet!", "error");
      modeToggle.checked = false; // Revert toggle state
      return; // Prevent mode change
    }
  }

  fetch("/manual")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then((data) => {
      console.log("Manual mode response:", data);
      const isManual = data.includes("ON");
      updateManualModeUI(isManual);
      showNotification(data, "success");
    })
    .catch((error) => {
      console.error("Error toggling manual mode:", error);
      showNotification("Failed to toggle manual mode", "error");
      modeToggle.checked = !modeToggle.checked; // Revert toggle state on error
    });
}

// Ensure these functions also respect the hunger/sad condition
async function setAutoMode() {
  const status = await getPetStatus();
  const STATE_SAD = 3;
  const HUNGER_THRESHOLD = 20;

  if (
    status &&
    status.currentEyeState === STATE_SAD &&
    status.hungerLevel <= HUNGER_THRESHOLD
  ) {
    showNotification("Pet is hungry and sad, feed pet!", "error");
    document.getElementById("modeToggle").checked = true; // Keep it in manual if it was trying to go auto
    return;
  }

  fetch("/manual")
    .then((response) => response.text())
    .then((data) => {
      if (data.includes("ON")) {
        // If currently ON (manual), toggle it OFF (auto)
        fetch("/manual")
          .then((resp) => resp.text())
          .then((d) => {
            console.log("Auto mode response:", d);
            updateManualModeUI(false);
            showNotification(d, "success");
          });
      } else {
        // If already OFF (auto), no action needed, but update UI to confirm
        updateManualModeUI(false);
        showNotification("Manual mode OFF", "success");
      }
    })
    .catch((error) => {
      console.error("Error setting auto mode:", error);
      showNotification("Failed to set auto mode", "error");
    });
}

async function setManualMode() {
  const status = await getPetStatus();
  const STATE_SAD = 3;
  const HUNGER_THRESHOLD = 20;

  if (
    status &&
    status.currentEyeState === STATE_SAD &&
    status.hungerLevel <= HUNGER_THRESHOLD
  ) {
    showNotification("Pet is hungry and sad, feed pet!", "error");
    document.getElementById("modeToggle").checked = false; // Keep it in auto if it was trying to go manual
    return;
  }

  fetch("/manual")
    .then((response) => response.text())
    .then((data) => {
      if (data.includes("OFF")) {
        // If currently OFF (auto), toggle it ON (manual)
        fetch("/manual")
          .then((resp) => resp.text())
          .then((d) => {
            console.log("Manual mode response:", d);
            updateManualModeUI(true);
            showNotification(d, "success");
          });
      } else {
        // If already ON (manual), no action needed, but update UI to confirm
        updateManualModeUI(true);
        showNotification("Manual mode ON", "success");
      }
    })
    .catch((error) => {
      console.error("Error setting manual mode:", error);
      showNotification("Failed to set manual mode", "error");
    });
}

function updateManualModeUI(isManual) {
  const modeToggle = document.getElementById("modeToggle");
  const emotionGrid = document.getElementById("emotionGrid");

  modeToggle.checked = isManual;
  if (isManual) {
    emotionGrid.classList.remove("disabled");
  } else {
    emotionGrid.classList.add("disabled");
  }
}

function feedPet() {
  fetch("/feed")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then((data) => {
      console.log("Feed pet response:", data);
      showNotification("Pet fed! Happy eyes activated", "success");
      // Call updateTreatsAfterFeed from stepstracker.js
      if (typeof updateTreatsAfterFeed === "function") {
        updateTreatsAfterFeed();
      }
    })
    .catch((error) => {
      console.error("Error feeding pet:", error);
      showNotification("Failed to feed pet", "error");
    });
}

function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.classList.add("notification", type);
  notification.textContent = message;
  document.body.appendChild(notification);

  // Remove the notification after a few seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Keyboard shortcuts
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey) {
    // Check for Ctrl/Cmd key
    switch (event.key) {
      case "0":
        send(0);
        break;
      case "1":
        send(1);
        break;
      case "2":
        send(2);
        break;
      case "3":
        send(3);
        break;
      case "4":
        send(4);
        break;
      case "5":
        send(5);
        break;
      case "6":
        send(6);
        break;
      case "7":
        send(7);
        break;
      case "8":
        send(8);
        break;
      case "9":
        send(9);
        break;
      case "l": // L for Light
      case "L":
        light();
        break;
      case "m": // M for Manual/Auto mode
      case "M":
        document.getElementById("modeToggle").click(); // Simulate click on the toggle
        break;
    }
  }
});

// // GOOGLE FIT
// const CLIENT_ID =
//   "354231827857-o0b9r3r1sjjqa48fuevnurj2j87669st.apps.googleusercontent.com";
// const DISCOVERY_DOC =
//   "https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest";
// const SCOPES =
//   "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.body.read https://www.googleapis.com/auth/fitness.location.read";

// let tokenClient;
// let isInitialized = false;

// async function initializeGapi() {
//   try {
//     document.getElementById("status").textContent = "Initializing...";

//     await new Promise((resolve) => {
//       gapi.load("client", resolve);
//     });

//     await gapi.client.init({
//       discoveryDocs: [DISCOVERY_DOC],
//     });

//     tokenClient = google.accounts.oauth2.initTokenClient({
//       client_id: CLIENT_ID,
//       scope: SCOPES,
//       callback: async (response) => {
//         if (response.error) {
//           document.getElementById("status").textContent =
//             "Error: " + response.error;
//           return;
//         }
//         document.getElementById("status").textContent =
//           "Connected! Fetching data...";
//         await fetchData();
//       },
//     });

//     isInitialized = true;
//     document.getElementById("status").textContent = "Ready to connect";
//   } catch (error) {
//     document.getElementById("status").textContent =
//       "Error initializing: " + error.message;
//   }
// }

// function connectToGoogleFit() {
//   if (!isInitialized) {
//     document.getElementById("status").textContent =
//       "Please wait, still loading...";
//     return;
//   }
//   document.getElementById("status").textContent = "Connecting...";
//   tokenClient.requestAccessToken();
// }

// async function fetchData() {
//   try {
//     const now = new Date();
//     const startOfDay = new Date(
//       now.getFullYear(),
//       now.getMonth(),
//       now.getDate()
//     );
//     const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

//     let totalSteps = 0;
//     let totalDistance = 0;

//     // Fetch Steps
//     const stepDataSources = [
//       "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
//       "derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas",
//     ];

//     for (const dataSource of stepDataSources) {
//       try {
//         const request = {
//           aggregateBy: [
//             {
//               dataTypeName: "com.google.step_count.delta",
//               dataSourceId: dataSource,
//             },
//           ],
//           bucketByTime: { durationMillis: 86400000 },
//           startTimeMillis: startOfDay.getTime(),
//           endTimeMillis: endOfDay.getTime(),
//         };

//         const response = await gapi.client.fitness.users.dataset.aggregate({
//           userId: "me",
//           resource: request,
//         });

//         if (response.result.bucket && response.result.bucket.length > 0) {
//           const bucket = response.result.bucket[0];
//           if (bucket.dataset && bucket.dataset.length > 0) {
//             const dataset = bucket.dataset[0];
//             if (dataset.point && dataset.point.length > 0) {
//               const steps = dataset.point.reduce((sum, point) => {
//                 return sum + (point.value[0].intVal || 0);
//               }, 0);
//               if (steps > 0) {
//                 totalSteps = Math.max(totalSteps, steps);
//                 break;
//               }
//             }
//           }
//         }
//       } catch (error) {
//         console.log("Step source failed:", error);
//       }
//     }

//     // Fetch Distance
//     const distanceDataSources = [
//       "derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta",
//       "derived:com.google.distance.delta:com.google.android.gms:estimated_distance_delta",
//     ];

//     for (const dataSource of distanceDataSources) {
//       try {
//         const request = {
//           aggregateBy: [
//             {
//               dataTypeName: "com.google.distance.delta",
//               dataSourceId: dataSource,
//             },
//           ],
//           bucketByTime: { durationMillis: 86400000 },
//           startTimeMillis: startOfDay.getTime(),
//           endTimeMillis: endOfDay.getTime(),
//         };

//         const response = await gapi.client.fitness.users.dataset.aggregate({
//           userId: "me",
//           resource: request,
//         });

//         if (response.result.bucket && response.result.bucket.length > 0) {
//           const bucket = response.result.bucket[0];
//           if (bucket.dataset && bucket.dataset.length > 0) {
//             const dataset = bucket.dataset[0];
//             if (dataset.point && dataset.point.length > 0) {
//               const distance = dataset.point.reduce((sum, point) => {
//                 return sum + (point.value[0].fpVal || 0);
//               }, 0);
//               if (distance > 0) {
//                 totalDistance = Math.max(totalDistance, distance);
//                 break;
//               }
//             }
//           }
//         }
//       } catch (error) {
//         console.log("Distance source failed:", error);
//       }
//     }

//     // Display results
//     document.getElementById("steps").textContent = totalSteps.toLocaleString();

//     let distanceText;
//     if (totalDistance >= 1000) {
//       distanceText = (totalDistance / 1000).toFixed(2) + " km";
//     } else {
//       distanceText = Math.round(totalDistance) + " meters";
//     }
//     document.getElementById("distance").textContent = distanceText;

//     document.getElementById("data").style.display = "block";
//     document.getElementById("status").textContent = "Data loaded successfully!";
//   } catch (error) {
//     document.getElementById("status").textContent =
//       "Error fetching data: " + error.message;
//   }
// }

// window.onload = function () {
//   setTimeout(() => {
//     if (
//       typeof gapi !== "undefined" &&
//       typeof google !== "undefined" &&
//       google.accounts
//     ) {
//       initializeGapi();
//     } else {
//       document.getElementById("status").textContent = "Loading Google APIs...";
//       setTimeout(arguments.callee, 500);
//     }
//   }, 100);
// };
