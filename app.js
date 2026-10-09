import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// Tunables — keep README pointing here instead of hardcoding these numbers in prose.
const HOLD_DURATION_MS = 300;
const COOLDOWN_MS = 2500;
const SCOOP_WINDOW_MS = 500;
const SCOOP_DISTANCE_THRESHOLD = 0.18; // summed normalized wrist displacement over the window
const FACE_ZONE = { xMin: 0.3, xMax: 0.7, yMin: 0.0, yMax: 0.45 };

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const debugEl = document.getElementById("debug");
const testBtn = document.getElementById("test-btn");
const memePane = document.querySelector(".meme-pane");
const memeVideo = document.getElementById("meme-video");

let handLandmarker = null;
let rightWristHistory = []; // { t, x, y }
let gestureStartTime = null;
let lastTriggerTime = -Infinity;

function playMeme() {
  memePane.classList.add("playing");
  memeVideo.currentTime = 0;
  memeVideo.play();
}

memeVideo.addEventListener("ended", () => memePane.classList.remove("playing"));
testBtn.addEventListener("click", playMeme);

function isInFaceZone(landmark) {
  return (
    landmark.x >= FACE_ZONE.xMin &&
    landmark.x <= FACE_ZONE.xMax &&
    landmark.y >= FACE_ZONE.yMin &&
    landmark.y <= FACE_ZONE.yMax
  );
}

function updateScoopDistance(wrist, now) {
  rightWristHistory.push({ t: now, x: wrist.x, y: wrist.y });
  rightWristHistory = rightWristHistory.filter((p) => now - p.t <= SCOOP_WINDOW_MS);

  let total = 0;
  for (let i = 1; i < rightWristHistory.length; i++) {
    const a = rightWristHistory[i - 1];
    const b = rightWristHistory[i];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function drawLandmarks(handsLandmarks) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const landmarks of handsLandmarks) {
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#4f7cff";
      ctx.fill();
    }
  }
}

function processResult(result, now) {
  const hands = result.handednesses;
  const landmarksList = result.landmarks;

  drawLandmarks(landmarksList);

  let leftNearFace = false;
  let scoopDistance = 0;

  for (let i = 0; i < hands.length; i++) {
    const label = hands[i][0]?.categoryName; // "Left" or "Right", subject-relative
    const landmarks = landmarksList[i];
    const wrist = landmarks[0];

    if (label === "Left" && isInFaceZone(wrist)) {
      leftNearFace = true;
    }
    if (label === "Right") {
      scoopDistance = updateScoopDistance(wrist, now);
    }
  }

  const scooping = scoopDistance > SCOOP_DISTANCE_THRESHOLD;
  debugEl.textContent = `face-zone: ${leftNearFace ? "yes" : "no"} · scoop: ${scoopDistance.toFixed(2)}`;

  const cooldownActive = now - lastTriggerTime < COOLDOWN_MS;

  if (leftNearFace && scooping && !cooldownActive) {
    if (gestureStartTime === null) gestureStartTime = now;
    const held = now - gestureStartTime;
    if (held >= HOLD_DURATION_MS) {
      statusEl.textContent = "Scuba Cat incoming! 🐱";
      lastTriggerTime = now;
      gestureStartTime = null;
      playMeme();
    } else {
      statusEl.textContent = `Detecting... ${Math.round(held)}/${HOLD_DURATION_MS}ms`;
    }
  } else {
    gestureStartTime = null;
    if (cooldownActive) {
      statusEl.textContent = "Nice! Cooling down...";
    } else if (hands.length < 2) {
      statusEl.textContent = "Show both hands";
    } else {
      statusEl.textContent = "Ready — left hand near face, right hand scooping";
    }
  }
}

function renderLoop() {
  if (video.readyState >= 2) {
    const now = performance.now();
    const result = handLandmarker.detectForVideo(video, now);
    processResult(result, now);
  }
  requestAnimationFrame(renderLoop);
}

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((resolve) => (video.onloadedmetadata = resolve));
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

async function setupHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

async function main() {
  try {
    await Promise.all([setupCamera(), setupHandLandmarker()]);
    statusEl.textContent = "Ready — left hand near face, right hand scooping";
    renderLoop();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Couldn't start webcam/hand tracking — check camera permission.";
  }
}

main();
