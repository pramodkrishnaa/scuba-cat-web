# Scuba Cat 🐱

A browser toy: open it, and once your webcam loads, scoop your right hand like
you're paddling with your left hand near your face — a cat in a diving mask
pops in right next to you, live, and disappears the moment you stop.

**[Live demo](#)** — _link filled in after deploy_

## How it works

Runs entirely in the browser, no backend. Opens on a blank splash ("let's get
ready to dance...") while the webcam and hand tracker spin up, then drops
straight into the camera feed with no on-screen instructions or debug readouts
— it's meant to feel like a toy, not a tutorial.

- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker)'s
  `HandLandmarker` tracks both hands from your webcam feed in real time (loaded
  from a CDN, no build step, no install).
- "Left hand near face" checks the left wrist landmark against a fixed region
  in the upper-center of frame. "Right hand scooping" requires the right wrist
  to have moved enough over the last ~600ms *and* reversed vertical direction
  at least once — a plain distance check alone triggered on any fast hand
  movement, not just an actual scoop.
- The cat panel is invisible until both conditions are true, then appears and
  plays for as long as they hold; it disappears the moment either breaks.
  Small grace windows absorb single-frame flicker. See the constants at the
  top of `app.js` (`START_GRACE_MS`, `STOP_GRACE_MS`, `SCOOP_DISTANCE_THRESHOLD`,
  `FACE_ZONE`) for the exact numbers — this README intentionally doesn't
  repeat them in prose so the two can't drift apart.
- **Gotcha worth knowing:** MediaPipe's handedness labels assume a mirrored
  (selfie-style) input image. This app analyzes the raw, unflipped camera
  frame (only the on-screen display is CSS-mirrored), so the labels come back
  swapped — see `ACTUAL_LEFT_HAND_LABEL/ACTUAL_RIGHT_HAND_LABEL` in `app.js`.

If your lighting/camera doesn't cooperate, the small "no camera? tap here"
button at the bottom fakes an active gesture for a few seconds.

## Local dev

No install, no build step:

```bash
npx serve .
```

Then open the printed `localhost` URL and grant camera access.

## Credits / history

This started as a Python/OpenCV desktop app that claimed to use MediaPipe but
actually just did generic motion-diffing. That original prototype is kept in
[`legacy-python/`](legacy-python) for history. This web app is a full rebuild
with real hand-tracking, run live in the browser so it could actually be
deployed somewhere (a desktop app with native windows and direct webcam access
can't run on Vercel).

## License

MIT — see [LICENSE](LICENSE).
