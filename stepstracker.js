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

const STEPS_PER_TREAT = 100;

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
  }
}

async function initializeGapi() {
  try {
    loadGameData();

    await new Promise((resolve) => {
      gapi.load("client", resolve);
    });

    await gapi.client.init({
      discoveryDocs: [DISCOVERY_DOC],
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response) => {
        if (response.error) {
          return;
        }
        await fetchData();
      },
    });

    isInitialized = true;

    if (gameData.totalTreats > 0) {
      document.getElementById(
        "totalTreats"
      ).textContent = `Total Treats: ${gameData.totalTreats}`;
      document.getElementById("totalTreats").style.display = "block";
    }
  } catch (error) {
    console.error("Error initializing:", error);
  }
}

function connectToGoogleFit() {
  if (!isInitialized) {
    return;
  }
  tokenClient.requestAccessToken();
}

async function fetchData() {
  try {
    updateDateIfNeeded();

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    let totalSteps = 0;

    const stepDataSources = [
      "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
      "derived:com.google.step_count.delta:com.google.android.gms:merge_step_deltas",
    ];

    for (const dataSource of stepDataSources) {
      try {
        const request = {
          aggregateBy: [
            {
              dataTypeName: "com.google.step_count.delta",
              dataSourceId: dataSource,
            },
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: startOfDay.getTime(),
          endTimeMillis: endOfDay.getTime(),
        };

        const response = await gapi.client.fitness.users.dataset.aggregate({
          userId: "me",
          resource: request,
        });

        if (response.result.bucket && response.result.bucket.length > 0) {
          const bucket = response.result.bucket[0];
          if (bucket.dataset && bucket.dataset.length > 0) {
            const dataset = bucket.dataset[0];
            if (dataset.point && dataset.point.length > 0) {
              const steps = dataset.point.reduce((sum, point) => {
                return sum + (point.value[0].intVal || 0);
              }, 0);
              if (steps > 0) {
                totalSteps = Math.max(totalSteps, steps);
                break;
              }
            }
          }
        }
      } catch (error) {
        console.log("Step source failed:", error);
      }
    }

    const availableSteps = Math.max(0, totalSteps - gameData.convertedSteps);
    availableTreats = Math.floor(availableSteps / STEPS_PER_TREAT);

    currentSteps = availableSteps;

    document.getElementById("connectBtn").style.display = "none";
    document.getElementById("totalStepsValue").textContent =
      totalSteps.toLocaleString();
    document.getElementById("totalStepsValue").style.display = "inline";

    document.getElementById(
      "stepDisplay"
    ).textContent = `${availableSteps.toLocaleString()} Steps available to convert`;
    document.getElementById("stepDisplay").style.display = "block";

    document.getElementById(
      "availableTreats"
    ).textContent = `${availableTreats} treats available`;
    document.getElementById("availableTreats").style.display = "none";

    if (availableTreats > 0) {
      document.getElementById("convertBtn").style.display = "inline-block";
    } else {
      document.getElementById("convertBtn").style.display = "none";
    }

    if (gameData.totalTreats > 0) {
      document.getElementById(
        "totalTreats"
      ).textContent = `Total Treats: ${gameData.totalTreats}`;
      document.getElementById("totalTreats").style.display = "block";
    }
  } catch (error) {
    console.error("Error fetching data:", error);
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

  document.getElementById(
    "totalTreats"
  ).textContent = `Total Treats: ${gameData.totalTreats}`;
  document.getElementById("totalTreats").style.display = "block";

  currentSteps = remainingSteps;
  availableTreats = 0;

  setTimeout(() => {
    document.getElementById("treatResult").style.display = "none";
  }, 3000);
}

window.onload = function () {
  setTimeout(() => {
    if (
      typeof gapi !== "undefined" &&
      typeof google !== "undefined" &&
      google.accounts
    ) {
      initializeGapi();
    } else {
      setTimeout(arguments.callee, 500);
    }
  }, 100);
};
