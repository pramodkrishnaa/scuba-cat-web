# Scuba Cat 🐱

A browser toy: show your webcam two hands, hold your **left hand near your face**
and scoop your **right hand** like you're paddling, and a cat in a diving mask
pops up to say hi.

**[Live demo](#)** — _link filled in after deploy_

## How it works

Runs entirely in the browser, no backend:

- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker)'s
  `HandLandmarker` tracks both hands from your webcam feed in real time (loaded
  from a CDN, no build step, no install).
- "Left hand near face" is a check that the left wrist landmark falls inside a
  fixed region in the upper-center of frame.
- "Right hand scooping" sums how far the right wrist has moved over the last
  ~500ms; enough movement counts as a scoop.
- Both conditions have to hold at once for a short moment before the video
  triggers, with a cooldown after each trigger so it doesn't spam. See the
  constants at the top of `app.js` (`HOLD_DURATION_MS`, `COOLDOWN_MS`,
  `SCOOP_DISTANCE_THRESHOLD`, `FACE_ZONE`) for the exact numbers — this README
  intentionally doesn't repeat them in prose so the two can't drift apart.

If your lighting/camera doesn't cooperate, hit **Test it 🐱** to see the
payoff directly.

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
