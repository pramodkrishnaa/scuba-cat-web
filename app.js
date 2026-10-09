import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

// Tunables.
const START_GRACE_MS = 100; // gesture must hold this long before the cat appears, filters single-frame noise
const STOP_GRACE_MS = 250; // gesture must be absent this long before the cat disappears, filters flicker
const MANUAL_ACTIVE_MS = 3000; // how long the fallback button fakes an active gesture
const SCOOP_WINDOW_MS = 600;
const SCOOP_DISTANCE_THRESHOLD = 0.15; // summed normalized wrist displacement over the window
const SCOOP_REVERSAL_EPSILON = 0.004; // minimum per-frame y-change counted toward a direction reversal
const FACE_ZONE = { xMin: 0.25, xMax: 0.75, yMin: 0.0, yMax: 0.5 };

// MediaPipe's legacy Hands solution assumes a MIRRORED (selfie-style) input
// image for handedness labels; it's unconfirmed whether the newer Tasks Vision
// HandLandmarker used here carries the same assumption against a raw, unflipped
// frame. If the cat never appears for real gestures, try swapping these two —
// that's the single most likely culprit. Named here instead of inline so it's
// a one-line experiment, not a hunt through the detection logic.
const ACTUAL_LEFT_HAND_LABEL = "Left";
const ACTUAL_RIGHT_HAND_LABEL = "Right";

const DEBUG = new URLSearchParams(location.search).has("debug");
const debugEl = DEBUG ? document.createElement("pre") : null;
if (debugEl) {
  debugEl.style.cssText =
    "position:fixed;top:0;left:0;background:#000c;color:#0f0;font-size:12px;padding:8px;z-index:999;margin:0;";
  document.body.appendChild(debugEl);
}

const splash = document.getElementById("splash");
const splashText = document.getElementById("splash-text");
const app = document.getElementById("app");
const video = document.getElementById("webcam");
const testBtn = document.getElementById("test-btn");
const memePane = document.getElementById("meme-pane");
const memeVideo = document.getElementById("meme-video");

let handLandmarker = null;
let rightWristHistory = []; // { t, x, y } — the user's actual right wrist
let lastDySign = 0;
let reversalTimestamps = [];
let gestureSince = null; // when the gesture-active condition most recently started being true
let gestureUntil = null; // when it most recently stopped being true
let manualActiveUntil = -Infinity;

testBtn.addEventListener("click", () => {
  manualActiveUntil = performance.now() + MANUAL_ACTIVE_MS;
});

function isInFaceZone(landmark) {
  return (
    landmark.x >= FACE_ZONE.xMin &&
    landmark.x <= FACE_ZONE.xMax &&
    landmark.y >= FACE_ZONE.yMin &&
    landmark.y <= FACE_ZONE.yMax
  );
}

function updateScoop(wrist, now) {
  rightWristHistory.push({ t: now, x: wrist.x, y: wrist.y });
  rightWristHistory = rightWristHistory.filter((p) => now - p.t <= SCOOP_WINDOW_MS);
  reversalTimestamps = reversalTimestamps.filter((t) => now - t <= SCOOP_WINDOW_MS);

  let distance = 0;
  for (let i = 1; i < rightWristHistory.length; i++) {
    const a = rightWristHistory[i - 1];
    const b = rightWristHistory[i];
    distance += Math.hypot(b.x - a.x, b.y - a.y);

    const dy = b.y - a.y;
    if (Math.abs(dy) > SCOOP_REVERSAL_EPSILON) {
      const sign = Math.sign(dy);
      if (lastDySign !== 0 && sign !== lastDySign) {
        reversalTimestamps.push(b.t);
      }
      lastDySign = sign;
    }
  }

  return { distance, reversals: reversalTimestamps.length };
}

function processResult(result, now) {
  const hands = result.handednesses;
  const landmarksList = result.landmarks;

  let leftNearFace = false;
  let scoopDistance = 0;
  let scoopReversals = 0;
  const seenLabels = [];

  for (let i = 0; i < hands.length; i++) {
    const label = hands[i][0]?.categoryName;
    const wrist = landmarksList[i][0];
    seenLabels.push(`${label}@(${wrist.x.toFixed(2)},${wrist.y.toFixed(2)})`);

    if (label === ACTUAL_LEFT_HAND_LABEL && isInFaceZone(wrist)) {
      leftNearFace = true;
    }
    if (label === ACTUAL_RIGHT_HAND_LABEL) {
      const scoop = updateScoop(wrist, now);
      scoopDistance = scoop.distance;
      scoopReversals = scoop.reversals;
    }
  }

  const scooping = scoopDistance > SCOOP_DISTANCE_THRESHOLD && scoopReversals >= 1;
  const rawActive = (leftNearFace && scooping) || now < manualActiveUntil;

  if (debugEl) {
    debugEl.textContent =
      `hands: ${seenLabels.join(" | ") || "none"}\n` +
      `face-zone (${ACTUAL_LEFT_HAND_LABEL}): ${leftNearFace}\n` +
      `scoop (${ACTUAL_RIGHT_HAND_LABEL}): dist=${scoopDistance.toFixed(3)} reversals=${scoopReversals} -> ${scooping}\n` +
      `active: ${rawActive}`;
  }

  // Track continuous true/false spans so a brief flicker doesn't toggle the cat on and off.
  if (rawActive) {
    if (gestureSince === null) gestureSince = now;
    gestureUntil = null;
  } else {
    if (gestureUntil === null) gestureUntil = now;
    gestureSince = null;
  }

  const sustainedActive = gestureSince !== null && now - gestureSince >= START_GRACE_MS;
  const sustainedInactive = gestureUntil !== null && now - gestureUntil >= STOP_GRACE_MS;

  if (sustainedActive && memeVideo.paused) {
    memeVideo.play();
    memePane.classList.add("active");
  } else if (sustainedInactive && !memeVideo.paused) {
    memeVideo.pause();
    memePane.classList.remove("active");
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
    splash.hidden = true;
    app.hidden = false;
    renderLoop();
  } catch (err) {
    console.error(err);
    splashText.textContent = "Couldn't start the webcam — check camera permission and reload.";
  }
}

main();
