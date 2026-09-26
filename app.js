/* ==========================================================================
 * WebAR Video Experience — app.js
 * Stack: Vanilla JS + MindAR 1.2.5 (image tracking) + Three.js 0.160.0
 * Official docs: https://hiukim.github.io/mind-ar-js-doc
 * Three.js example this is based on:
 *   https://hiukim.github.io/mind-ar-js-doc/more-examples/threejs-image
 * ========================================================================== */

import * as THREE from "three";
import { MindARThree } from "mindar-image-three";

/* ------------------------------ CONFIG ----------------------------------
 * Edit these values to customize the experience. You should NOT need to
 * touch the AR logic below.
 * ------------------------------------------------------------------------ */
const CONFIG = {
  // MindAR compiled target. Generate it from ./assets/target.jpg (see README).
  targetSrc: "./assets/target.mind",

  // Video file played on the poster.
  videoPath: "./assets/video.mp4",

  /* Video plane size in MindAR world units.
   * The target image is ~1 unit wide, so VIDEO_WIDTH = 1 spans the poster.
   * VIDEO_HEIGHT should match your VIDEO's aspect ratio (not the poster's):
   *   16:9 video -> 1.0 x 0.5625   |  4:3 video -> 1.0 x 0.75
   *   square     -> 0.7 x 0.7       |  A4 poster fill -> 1.0 x 1.4142
   * If the plane looks stretched, fix these two numbers. */
  videoWidth: 1.0,
  videoHeight: 0.5625,

  // Physical printed poster size (for documentation / future scaling).
  // MindAR normalizes tracking to the image, so changing print size does NOT
  // require code changes — the video scales with the poster automatically.
  // Just keep the poster's ASPECT RATIO identical to target.jpg.
  physicalWidthMm: 210,   // A4 width
  physicalHeightMm: 297,  // A4 height

  autoplay: true,   // try to play as soon as the target is found
  loop: true,       // set on the <video> element too
  muted: true,      // MUST start muted (mobile autoplay policy). Sound btn unmutes.
};

/* Set to true to show the debug panel (target state, camera, video, fps). */
const DEBUG = false;

/* Public URL of this experience. Defaults to the page's own URL so the QR
 * code works on any host without hard-coding a username. To pin a custom
 * URL (e.g. after GitHub Pages deploy), set e.g.:
 *   const AR_URL = "https://YOUR-USERNAME.github.io/webar-video-ar/";
 * See README section "QR Code". */
const AR_URL = window.location.href.split("#")[0];

/* ------------------------------------------------------------------------ */

// --- DOM refs ---
const landing = document.getElementById("landing");
const arScreen = document.getElementById("arScreen");
const startBtn = document.getElementById("startBtn");
const landingError = document.getElementById("landingError");
const container = document.getElementById("arContainer");
const video = document.getElementById("arVideo");
const statusPill = document.getElementById("statusPill");
const soundBtn = document.getElementById("soundBtn");
const exitBtn = document.getElementById("exitBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const errorOverlay = document.getElementById("errorOverlay");
const errorMessage = document.getElementById("errorMessage");
const errorBackBtn = document.getElementById("errorBackBtn");
const debugPanel = document.getElementById("debugPanel");
const qrCanvas = document.getElementById("qrCanvas");
const arUrlText = document.getElementById("arUrlText");
const downloadQrBtn = document.getElementById("downloadQrBtn");

// --- AR state (created once, reused) ---
let mindarThree = null;
let anchor = null;
let videoTexture = null;
let videoPlane = null;
let renderer = null;
let scene = null;
let camera = null;
let arStarted = false;
let targetVisible = false;
let startTime = 0;
let frames = 0;

video.muted = CONFIG.muted;
video.loop = CONFIG.loop;

/* ============================== helpers ================================= */

function log(...args) {
  if (DEBUG) console.log("[WebAR]", ...args);
}

function setStatus(text, found = false) {
  statusPill.textContent = text;
  statusPill.classList.toggle("found", found);
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingOverlay.hidden = false;
}
function hideLoading() {
  loadingOverlay.hidden = true;
}

function showError(message) {
  errorMessage.textContent = message;
  errorOverlay.hidden = false;
  hideLoading();
}

function isSecure() {
  // Camera requires a secure context: HTTPS, or localhost for development.
  return (
    window.isSecureContext ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("webgl2"));
  } catch {
    return false;
  }
}

/** Friendly message for getUserMedia / MindAR start failures. */
function cameraErrorMessage(err) {
  const name = err && err.name ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access is required to use this AR experience. Please allow camera access in your browser and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Please use a phone, tablet, or computer with a camera.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is already in use by another app or tab. Please close it and try again.";
  }
  if (typeof err === "string" && err.includes("target.mind")) return err;
  return "Could not start the camera (" + (name || "unknown error") + "). Please use Chrome on Android or Safari on iPhone over HTTPS and try again.";
}

/* ============================ AR lifecycle ============================== */

/** Pre-flight checks that give friendly errors instead of console-only failures. */
async function preflight() {
  if (!isSecure()) {
    throw new Error(
      "This page needs HTTPS for camera access. Please deploy to GitHub Pages (HTTPS) or use a local HTTPS server — opening index.html via file:// will not work."
    );
  }
  if (!webglAvailable()) {
    throw new Error("WebGL is not available in this browser. Please update your browser and enable hardware acceleration.");
  }
  // Check the compiled target exists (MindAR would otherwise fail obscurely).
  try {
    const res = await fetch(CONFIG.targetSrc, { method: "HEAD" });
    if (!res.ok) throw new Error("missing");
  } catch {
    throw new Error(
      "Target file assets/target.mind was not found. Generate it from assets/target.jpg using the MindAR compiler — see README section 'Creating target.mind'."
    );
  }
}

/** Build the MindAR + Three.js scene once. Called on first START tap. */
async function initAR() {
  mindarThree = new MindARThree({
    container,
    imageTargetSrc: CONFIG.targetSrc,
    // maxTrackCount: 1 keeps mobile performance best for a single poster.
    maxTrackCount: 1,
  });

  ({ renderer, scene, camera } = mindarThree);
  anchor = mindarThree.addAnchor(0);

  // --- Video texture (created ONCE, reused on every detection) ---
  video.src = CONFIG.videoPath; // honour CONFIG without touching logic
  videoTexture = new THREE.VideoTexture(video);
  videoTexture.colorSpace = THREE.SRGBColorSpace; // correct colors (Three r152+)
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;

  const geometry = new THREE.PlaneGeometry(CONFIG.videoWidth, CONFIG.videoHeight);
  const material = new THREE.MeshBasicMaterial({
    map: videoTexture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  videoPlane = new THREE.Mesh(geometry, material);
  videoPlane.visible = false; // hidden until TARGET FOUND
  anchor.group.add(videoPlane);

  // --- Real MindAR tracking events (no simulation, no setTimeout) ---
  anchor.onTargetFound = () => {
    targetVisible = true;
    log("TARGET FOUND");
    videoPlane.visible = true;
    setStatus("✓ Poster detected", true);
    if (CONFIG.autoplay) {
      video.play().catch((e) => {
        log("play() blocked:", e);
        setStatus("✓ Poster detected — tap 🔊 for video", true);
      });
    }
    updateDebug();
  };

  anchor.onTargetLost = () => {
    targetVisible = false;
    log("TARGET LOST");
    video.pause(); // pause when the poster leaves the frame
    videoPlane.visible = false;
    setStatus("Point your camera at the poster");
    updateDebug();
  };

  // Video element diagnostics -> user-facing messages.
  video.addEventListener("error", () => {
    log("video error", video.error);
    showError("The video file could not be loaded. Check that assets/video.mp4 exists and is a valid H.264 MP4.");
  });
  video.addEventListener("playing", updateDebug);
  video.addEventListener("pause", updateDebug);

  // Single render loop for the whole session (never recreated).
  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
    if (DEBUG) {
      frames++;
      const el = (performance.now() - startTime) / 1000;
      if (el >= 1) {
        updateDebug(Math.round(frames / el));
        frames = 0;
        startTime = performance.now();
      }
    }
  });
}

async function startAR() {
  if (arStarted) return;
  startBtn.disabled = true;
  landingError.hidden = true;

  // Switch UI immediately so the user sees feedback while we init.
  landing.hidden = true;
  arScreen.hidden = false;
  document.body.style.overflow = "hidden";
  showLoading("Checking requirements…");

  try {
    await preflight();
    showLoading("Starting camera… (please allow access)");

    if (!mindarThree) await initAR(); // create once, reuse afterwards

    // NOTE: MindAR requests the camera here — only after the START tap,
    // satisfying mobile user-gesture requirements.
    await mindarThree.start();
    startTime = performance.now();

    arStarted = true;
    hideLoading();
    setStatus("Point your camera at the poster");
    log("AR started");
  } catch (err) {
    console.error(err);
    const msg = err && err.message && !err.name ? err.message : cameraErrorMessage(err);
    // Fatal before camera started -> go back to landing with the message.
    stopUI();
    landingError.textContent = msg;
    landingError.hidden = false;
    startBtn.disabled = false;
  }
}

async function stopAR() {
  try {
    video.pause();
    if (mindarThree && arStarted) {
      await mindarThree.stop();
      renderer && renderer.setAnimationLoop(null);
      // Recreate the loop lazily on next start (initAR guard keeps objects).
      if (renderer) {
        renderer.setAnimationLoop(() => renderer.render(scene, camera));
        renderer.setAnimationLoop(null);
      }
    }
  } catch (e) {
    log("stop error", e);
  }
  arStarted = false;
  targetVisible = false;
  stopUI();
  startBtn.disabled = false;
}

function stopUI() {
  arScreen.hidden = true;
  landing.hidden = false;
  document.body.style.overflow = "";
  hideLoading();
  errorOverlay.hidden = true;
}

/* ================================ UI ==================================== */

startBtn.addEventListener("click", startAR);
exitBtn.addEventListener("click", stopAR);
errorBackBtn.addEventListener("click", stopAR);

// Sound may only start after a user gesture: this button IS that gesture.
soundBtn.addEventListener("click", async () => {
  try {
    if (video.muted) {
      video.muted = false;
      await video.play();
      soundBtn.innerHTML = "🔊 Sound on";
      soundBtn.setAttribute("aria-pressed", "true");
    } else {
      video.muted = true;
      soundBtn.innerHTML = "🔊 Sound off";
      soundBtn.setAttribute("aria-pressed", "false");
    }
    if (!targetVisible) setStatus("Point your camera at the poster");
  } catch (e) {
    video.muted = true;
    log("unmute blocked:", e);
    showError("Audio could not start. Point at the poster first, then tap Sound again.");
  }
});

document.addEventListener("visibilitychange", () => {
  // Pause video when tab hidden to save battery; resume handled by targetFound.
  if (document.hidden && arStarted) video.pause();
});

/* -------------------------------- debug --------------------------------- */
function updateDebug(fps) {
  if (!DEBUG) return;
  debugPanel.hidden = false;
  const state = arStarted ? (targetVisible ? "TRACKING" : "SCANNING") : "IDLE";
  debugPanel.textContent =
    "state: " + state + "\n" +
    "camera: " + (arStarted ? "running" : "stopped") + "\n" +
    "video: " + (video.paused ? "paused" : "playing") + " muted=" + video.muted + "\n" +
    (fps ? "fps: " + fps + "\n" : "") +
    "target: " + CONFIG.targetSrc;
}
if (DEBUG) updateDebug();

/* ------------------------------ QR section ------------------------------ */
(function initQR() {
  arUrlText.textContent = AR_URL;
  const drawFallback = () => {
    // If the QR CDN is offline, keep the URL text so the page still works.
    qrCanvas.getContext("2d").clearRect(0, 0, 200, 200);
  };
  try {
    if (window.QRCode && window.QRCode.toCanvas) {
      window.QRCode.toCanvas(qrCanvas, AR_URL, { width: 200, margin: 1 }, (err) => {
        if (err) drawFallback();
      });
    } else {
      // Library loads async sometimes — retry once shortly.
      setTimeout(() => {
        if (window.QRCode && window.QRCode.toCanvas) {
          window.QRCode.toCanvas(qrCanvas, AR_URL, { width: 200, margin: 1 }, () => {});
        }
      }, 1500);
    }
  } catch {
    drawFallback();
  }
  downloadQrBtn.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = qrCanvas.toDataURL("image/png");
    a.download = "webar-qr.png";
    a.click();
  });
})();
