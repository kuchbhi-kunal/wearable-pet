const CLIENT_ID =
  "354231827857-o0b9r3r1sjjqa48fuevnurj2j87669st.apps.googleusercontent.com";
const DISCOVERY_DOC =
  "https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest";
const SCOPES =
  "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.body.read https://www.googleapis.com/auth/fitness.location.read";

let tokenClient;
let isInitialized = false;
let currentSteps = 0;
let availableTreats = 0;

const STEPS_PER_TREAT = 500;

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
    gameData.convertedSteps = 0; // Reset converted steps for new day
    saveGameData();
    console.log("New day detected. Converted steps reset.");
  }
}

// New function to show/hide the loader
function showStepLoader(show) {
  const loader = document.getElementById("stepLoader");
  if (loader) {
    loader.style.display = show ? "inline" : "none";
  }
  const totalStepsValue = document.getElementById("totalStepsValue");
  if (totalStepsValue) {
    totalStepsValue.style.display = show ? "none" : "inline"; // Hide steps while loading
  }
}

function initializeGapi() {
  if (isInitialized) return;

  gapi.client
    .init({
      discoveryDocs: [DISCOVERY_DOC],
      clientId: CLIENT_ID,
      scope: SCOPES,
    })
    .then(() => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            gapi.client.setToken(tokenResponse);
            fetchData();
          } else {
            console.error("Token response error:", tokenResponse);
          }
        },
      });
      isInitialized = true;
      document.getElementById("connectBtn").textContent = "Refresh Steps"; // Change button text
      fetchData(); // Attempt to fetch data on init
    })
    .catch((error) => {
      console.error("Error initializing GAPI client:", error);
      // document.getElementById("status").textContent = "Failed to load Google APIs.";
    });
}

function connectToGoogleFit() {
  if (!tokenClient) {
    console.error("Token client not initialized.");
    return;
  }
  tokenClient.requestAccessToken();
}

async function fetchData() {
  showStepLoader(true); // Show loader
  // document.getElementById("status").textContent = "Fetching data...";
  updateDateIfNeeded(); // Check for new day before fetching

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999); // End of today

  const startTimeMillis = today.getTime();
  const endTimeMillis = endOfDay.getTime();

  try {
    // Steps data
    const stepsResponse = await gapi.client.fitness.users.dataset.aggregate({
      userId: "me",
      resource: "dataset",
      requestBody: {
        aggregateBy: [
          {
            dataTypeName: "com.google.step_count.delta",
            dataSourceId:
              "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
          },
        ],
        bucketByTime: { durationMillis: 86400000 }, // One day in milliseconds
        startTimeMillis: startTimeMillis,
        endTimeMillis: endTimeMillis,
      },
    });

    let totalSteps = 0;
    if (stepsResponse.result.bucket && stepsResponse.result.bucket.length > 0) {
      for (const bucket of stepsResponse.result.bucket) {
        if (bucket.dataset && bucket.dataset.length > 0) {
          for (const dataset of bucket.dataset) {
            if (dataset.point && dataset.point.length > 0) {
              totalSteps += dataset.point.reduce((sum, point) => {
                return sum + (point.value[0].intVal || 0);
              }, 0);
            }
          }
        }
      }
    }
    currentSteps = totalSteps; // Update global currentSteps

    const stepsSinceLastConversion = currentSteps - gameData.convertedSteps;
    availableTreats = Math.floor(stepsSinceLastConversion / STEPS_PER_TREAT);

    document.getElementById(
      "totalStepsValue"
    ).textContent = `${totalSteps.toLocaleString()} steps`; // Update actual steps display

    updateTreatsDisplay();
    // document.getElementById("status").textContent = "Data loaded successfully!";
  } catch (error) {
    console.error("Error fetching data:", error);
    // document.getElementById("status").textContent =
    //   "Error fetching data: " + error.message;
  } finally {
    showStepLoader(false); // Hide loader regardless of success or failure
  }
}

function updateTreatsDisplay() {
  document.getElementById("stepDisplay").textContent = `${(
    currentSteps - gameData.convertedSteps
  ).toLocaleString()} Steps available to convert`;
  document.getElementById(
    "availableTreats"
  ).textContent = `${availableTreats} treat${
    availableTreats !== 1 ? "s" : ""
  } available`;

  document.getElementById(
    "totalTreats"
  ).textContent = `Total treats: ${gameData.totalTreats}`;

  if (availableTreats > 0) {
    document.getElementById("convertBtn").style.display = "block";
  } else {
    document.getElementById("convertBtn").style.display = "none";
  }
}

function convertToTreats() {
  if (availableTreats === 0) return;

  const stepsToConvert = availableTreats * STEPS_PER_TREAT;
  const remainingSteps = currentSteps - stepsToConvert;

  gameData.convertedSteps += stepsToConvert;
  gameData.totalTreats += availableTreats;
  saveGameData();

  document.getElementById(
    "stepDisplay"
  ).textContent = `${remainingSteps.toLocaleString()} Steps available to convert`;
  document.getElementById("availableTreats").textContent = `0 treats available`;
  document.getElementById("convertBtn").style.display = "none";

  document.getElementById(
    "treatResult"
  ).textContent = `${availableTreats} Treat${
    availableTreats !== 1 ? "s" : ""
  } Bought!`;
  document.getElementById("treatResult").style.display = "block";

  // Update treats display and button after conversion
  updateTreatsDisplay();

  currentSteps = remainingSteps;
  availableTreats = 0;

  setTimeout(() => {
    document.getElementById("treatResult").style.display = "none";
  }, 3000);
}

function updateTreatsAfterFeed() {
  if (gameData.totalTreats > 0) {
    gameData.totalTreats -= 1;
    saveGameData();
  }
  // Always update display after feeding, even if it goes to 0
  updateTreatsDisplay();
}

window.onload = function () {
  setTimeout(() => {
    if (
      typeof gapi !== "undefined" &&
      typeof google !== "undefined" &&
      google.accounts
    ) {
      loadGameData(); // Load game data at the start
      initializeGapi();
    } else {
      // document.getElementById("status").textContent = "Loading Google APIs...";
      console.log("Loading Google APIs...");
    }
  }, 100);
};
