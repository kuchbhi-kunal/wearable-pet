const CLIENT_ID =
  "354231827857-o0b9r3r1sjjqa48fuevnurj2j87669st.apps.googleusercontent.com";
const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest";
const SCOPES =
  "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.body.read https://www.googleapis.com/auth/fitness.location.read";

let tokenClient;
let isInitialized = false; // Indicates if tokenClient has been set up
let currentSteps = 0;
let availableTreats = 0;
let isCriticallyHungryWeb = false; // New global variable to track hunger status on web

const STEPS_PER_TREAT = 100;

// Milliseconds in one day (24 hours * 60 minutes * 60 seconds * 1000 milliseconds)
const ONE_DAY_IN_MILLIS = 24 * 60 * 60 * 1000;

let gameData = {
  convertedSteps: 0,
  totalTreats: 0,
  lastUpdateDate: null,
};

function saveGameData() {
  localStorage.setItem("virtualPetData", JSON.stringify(gameData));
  console.log("Game data saved:", gameData);
}

function loadGameData() {
  const saved = localStorage.getItem("virtualPetData");
  if (saved) {
    gameData = JSON.parse(saved);
  }
  console.log("Game data loaded:", gameData);
}

function isNewDay() {
  const today = new Date().toDateString();
  return gameData.lastUpdateDate !== today;
}

function updateDateIfNeeded() {
  const today = new Date().toDateString();
  if (gameData.lastUpdateDate !== today) {
    gameData.lastUpdateDate = today;
    gameData.convertedSteps = 0; // Reset converted steps for a new day
    saveGameData();
    console.log("New day detected. Steps reset.");
  }
}

// This function now primarily initializes the Google Identity Services (GIS) tokenClient
function initializeGisClient() {
  // Renamed for clarity
  const statusElement = document.getElementById("status");
  if (statusElement) {
    statusElement.textContent = "Initializing Google services...";
  }

  // Ensure google.accounts.oauth2 is available before initializing tokenClient
  if (
    typeof google === "undefined" ||
    !google.accounts ||
    !google.accounts.oauth2
  ) {
    console.error(
      "Google Identity Services (google.accounts.oauth2) not available. Check script loading."
    );
    if (statusElement) {
      statusElement.textContent =
        "Error: Google Identity Services failed to load.";
    }
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      // This callback is triggered after a successful token request
      if (tokenResponse && tokenResponse.access_token) {
        gapi.client.setToken(tokenResponse); // Set the obtained token on the gapi.client for API calls
        console.log("Access token obtained:", tokenResponse.access_token);
        isInitialized = true; // Mark as initialized
        checkLoginStatus(); // Update UI based on new login status
      } else {
        console.log("Token response (no access token):", tokenResponse);
        if (statusElement) statusElement.textContent = "Authentication failed.";
      }
    },
    error_callback: (error) => {
      console.error("Token client error:", error);
      if (statusElement)
        statusElement.textContent = "Authentication error: " + error.message;
    },
  });

  // After tokenClient is set up, attempt to check login status
  // This can trigger a silent token refresh if user previously consented.
  isInitialized = true; // Mark as initialized once tokenClient is ready to be used
  checkLoginStatus(); // Initial check to update UI after tokenClient setup
  if (statusElement)
    statusElement.textContent = "Ready to connect to Google Fit.";
}

function connectToGoogleFit() {
  const statusElement = document.getElementById("status");
  if (!isInitialized || !tokenClient) {
    console.warn("Google authentication client not fully initialized yet.");
    if (statusElement) {
      statusElement.textContent =
        "Google services are still loading. Please wait...";
    }
    return;
  }
  // Request a new access token
  tokenClient.requestAccessToken();
}

function checkLoginStatus() {
  // Ensure gapi.client and gapi.client.fitness are loaded before attempting to get token or fetch data
  if (!gapi.client || !gapi.client.fitness) {
    console.warn(
      "Google APIs (gapi.client or gapi.client.fitness) not fully loaded yet."
    );
    const statusElement = document.getElementById("status");
    if (statusElement)
      statusElement.textContent = "Google Fitness API is still loading...";
    // You might want to delay checkLoginStatus until both are guaranteed to be loaded
    return;
  }

  const token = gapi.client.getToken(); // Get the current token from gapi.client (if set)
  const connectBtn = document.getElementById("connectBtn");
  const totalStepsValue = document.getElementById("totalStepsValue");
  const statusElement = document.getElementById("status");

  if (token && token.access_token) {
    if (connectBtn) connectBtn.style.display = "none"; // Hide connect button
    if (totalStepsValue) totalStepsValue.style.display = "inline"; // Show steps value
    fetchFitnessData(); // Fetch data if already logged in
    if (statusElement) statusElement.textContent = "Connected to Google Fit.";
  } else {
    if (connectBtn) connectBtn.style.display = "inline"; // Show connect button
    if (totalStepsValue) {
      totalStepsValue.style.display = "none"; // Hide steps value
      totalStepsValue.textContent = "";
    }
    if (statusElement)
      statusElement.textContent = "Please connect to Google Fit.";
  }
}

async function fetchFitnessData() {
  // Ensure gapi.client.fitness is available before making API call
  if (!gapi.client || !gapi.client.fitness) {
    console.error(
      "Attempted to fetch fitness data before gapi.client.fitness was loaded."
    );
    const statusElement = document.getElementById("status");
    if (statusElement)
      statusElement.textContent = "Error: Fitness API not ready.";
    return;
  }

  const statusElement = document.getElementById("status");
  if (statusElement) statusElement.textContent = "Fetching fitness data...";
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999); // End of today

  const startTimeMillis = today.getTime();
  const endTimeMillis = endOfDay.getTime();

  let totalSteps = 0;

  try {
    const stepsResponse = await gapi.client.fitness.users.dataset.aggregate({
      userId: "me",
      aggregateBy: [
        {
          dataTypeName: "com.google.step_count.delta",
          dataSourceId:
            "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
        },
      ],
      // CORRECTED: Use durationMillis for bucketing by day
      bucketByTime: {
        durationMillis: ONE_DAY_IN_MILLIS,
      },
      startTimeMillis: startTimeMillis,
      endTimeMillis: endTimeMillis,
    });

    if (stepsResponse.result && stepsResponse.result.bucket) {
      stepsResponse.result.bucket.forEach((bucket) => {
        if (bucket.dataset) {
          bucket.dataset.forEach((dataset) => {
            if (dataset.point) {
              dataset.point.forEach((point) => {
                if (point.value && point.value[0] && point.value[0].intVal) {
                  totalSteps += point.value[0].intVal;
                }
              });
            }
          });
        }
      });
    }

    currentSteps = totalSteps - gameData.convertedSteps;
    availableTreats = Math.floor(currentSteps / STEPS_PER_TREAT);

    if (document.getElementById("totalStepsValue"))
      document.getElementById("totalStepsValue").textContent =
        totalSteps.toLocaleString();
    if (document.getElementById("stepDisplay"))
      document.getElementById(
        "stepDisplay"
      ).textContent = `Available steps to convert: ${currentSteps.toLocaleString()}`;
    if (document.getElementById("availableTreats"))
      document.getElementById(
        "availableTreats"
      ).textContent = `${availableTreats} treats available`;

    const convertBtn = document.getElementById("convertBtn");
    if (convertBtn) {
      if (availableTreats > 0) {
        convertBtn.style.display = "block";
        convertBtn.disabled = false;
      } else {
        convertBtn.style.display = "none";
        convertBtn.disabled = true;
      }
    }

    updateTreatsDisplay(); // Call this to ensure feed button is updated

    if (statusElement) statusElement.textContent = "Data loaded successfully!";
  } catch (error) {
    console.error("Error fetching fitness data:", error);
    if (statusElement)
      statusElement.textContent = "Error fetching data: " + error.message;
  }
}

function convertToTreats() {
  if (availableTreats === 0) {
    showNotification("No steps available to convert!", "error");
    return;
  }

  const convertedAmount = availableTreats * STEPS_PER_TREAT;
  const remainingSteps = currentSteps - convertedAmount;

  gameData.convertedSteps += convertedAmount;
  gameData.totalTreats += availableTreats;
  saveGameData();

  if (document.getElementById("stepDisplay"))
    document.getElementById(
      "stepDisplay"
    ).textContent = `Available steps to convert: ${remainingSteps.toLocaleString()} Steps available to convert`;
  if (document.getElementById("availableTreats"))
    document.getElementById(
      "availableTreats"
    ).textContent = `0 treats available`;
  const convertBtn = document.getElementById("convertBtn");
  if (convertBtn) convertBtn.style.display = "none";

  const treatResult = document.getElementById("treatResult");
  if (treatResult) {
    treatResult.textContent = `${availableTreats} Treat${
      availableTreats !== 1 ? "s" : ""
    } Bought!`;
    treatResult.style.display = "block";
  }

  const totalTreatsDisplay = document.getElementById("totalTreats");
  if (totalTreatsDisplay) {
    totalTreatsDisplay.textContent = `Total Treats: ${gameData.totalTreats}`;
    totalTreatsDisplay.style.display = "block";
  }

  currentSteps = remainingSteps;
  availableTreats = 0;

  setTimeout(() => {
    if (treatResult) treatResult.style.display = "none";
  }, 3000);

  updateTreatsDisplay(); // Update feed button after conversion
}

function updateTreatsDisplay() {
  const totalTreatsElement = document.getElementById("totalTreats");
  if (totalTreatsElement) {
    if (gameData.totalTreats > 0) {
      totalTreatsElement.innerHTML = `
        Total Treats: ${gameData.totalTreats}
        <button id="feedBtn" onclick="feedPet()" class="feed-btn">
          Feed Pet
        </button>
      `;
    } else {
      totalTreatsElement.innerHTML = `Total Treats: 0`;
    }
  }
}

async function feedPet() {
  if (gameData.totalTreats <= 0) {
    showNotification("You don't have any treats!", "error");
    return;
  }

  const feedBtn = document.getElementById("feedBtn");
  if (feedBtn) {
    feedBtn.disabled = true;
    feedBtn.textContent = "Feeding...";
  }

  try {
    const response = await fetch("/feed");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.text();
    console.log("Feed response:", data);
    showNotification("Pet fed! Hunger restored.", "success");

    gameData.totalTreats -= 1;
    saveGameData();
    updateTreatsDisplay(); // Update the treats count and feed button

    // Immediately fetch hunger level after feeding
    fetchHungerLevel();
  } catch (error) {
    console.error("Error feeding pet:", error);
    showNotification("Failed to feed pet.", "error");
  } finally {
    if (feedBtn) {
      feedBtn.disabled = false;
      feedBtn.textContent = "Feed Pet";
    }
  }
}

// --- Fetch Hunger Level Function ---
async function fetchHungerLevel() {
  try {
    const response = await fetch("/hunger");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const hungerLevel = data.hunger;
    const isCritical = data.critical;

    const hungerBarFill = document.getElementById("hungerBarFill");
    const hungerLevelText = document.getElementById("hungerLevelText");
    const emotionButtons = document.querySelectorAll(".emotion-btn");

    // Update hunger bar width and color
    if (hungerBarFill) {
      hungerBarFill.style.width = `${hungerLevel}%`;
      hungerBarFill.classList.remove("warning", "critical");
      if (hungerLevel <= 20) {
        hungerBarFill.classList.add("critical");
      } else if (hungerLevel <= 50) {
        hungerBarFill.classList.add("warning");
      }
    }
    if (hungerLevelText) {
      hungerLevelText.textContent = `${hungerLevel}%`;
    }

    // Update global hunger status for web
    isCriticallyHungryWeb = isCritical;

    // Enable/disable emotion buttons based on critical hunger
    emotionButtons.forEach((button) => {
      const state = parseInt(button.dataset.state);
      // If pet is critically hungry, disable all buttons except 'Sad' (state 3)
      if (isCriticallyHungryWeb) {
        if (state === 3) {
          // Sad state
          button.disabled = false; // Always allow sad state
          button.title = "Pet is critically hungry, can only be sad.";
        } else {
          button.disabled = true;
          button.title =
            "Pet is critically hungry, feed it to change emotions.";
        }
      } else {
        button.disabled = false; // Enable all buttons if not critically hungry
        button.title = ""; // Clear title
      }
    });
  } catch (error) {
    console.error("Error fetching hunger level:", error);
    showNotification("Failed to fetch hunger level.", "error");
  }
}

// Existing function, ensure it's still present in wearable.js if not directly here
function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  document.body.appendChild(notification);
  notification.textContent = message;

  setTimeout(() => {
    notification.classList.add("hide");
    notification.addEventListener("transitionend", () => {
      notification.remove();
    });
  }, 3000);
}

window.onload = function () {
  loadGameData();
  updateDateIfNeeded();
  updateTreatsDisplay(); // Ensure feed button is set up correctly on load

  // Load gapi client library (gapi.client) first.
  gapi.load("client", () => {
    // Once gapi.client is loaded, then load the specific Fitness API.
    gapi.client
      .load("fitness", "v1")
      .then(() => {
        // After both gapi.client and gapi.client.fitness are loaded,
        // then initialize Google Identity Services (GIS) token client.
        // This also ensures 'google.accounts.oauth2' from gsi/client.js is ready.
        if (
          typeof google !== "undefined" &&
          google.accounts &&
          google.accounts.oauth2
        ) {
          initializeGisClient(); // Call the GIS token client initialization
        } else {
          const statusElement = document.getElementById("status");
          if (statusElement)
            statusElement.textContent =
              "Error: Google Identity Services library not loaded.";
          console.error(
            "Google Identity Services (google.accounts.oauth2) not available. Check gsi/client.js script loading."
          );
        }
      })
      .catch((error) => {
        const statusElement = document.getElementById("status");
        if (statusElement)
          statusElement.textContent =
            "Error loading Fitness API: " + error.message;
        console.error("Error loading Google Fitness API:", error);
      });
  });

  // Initial fetch of hunger level and then set up interval
  // These do not depend on gapi/GIS authentication, so they can be called directly
  fetchHungerLevel();
  setInterval(fetchHungerLevel, 5000);
};
