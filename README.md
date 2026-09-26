# WebAR Video Experience

Scan QR &rarr; Open website &rarr; Allow camera &rarr; Point at poster &rarr;
Poster is recognized &rarr; MP4 video appears on the poster and follows it &rarr;
Video pauses when the poster disappears.

Browser-based WebAR. **No app installation.** Built with
[MindAR 1.2.5](https://hiukim.github.io/mind-ar-js-doc) image tracking +
[Three.js 0.160.0](https://threejs.org), vanilla HTML/CSS/JS, deployable as a
static site on GitHub Pages.

## Features

- Mobile-first landing page with START AR (camera starts only after tap)
- Real MindAR image tracking (`onTargetFound` / `onTargetLost`, no simulation)
- MP4 anchored to the poster as a Three.js `VideoTexture` plane
- Muted autoplay + tap-to-unmute 🔊 Sound button (mobile autoplay policy)
- Pause + hide on target lost, resume on target found
- Fullscreen camera UI, portrait-friendly, no scroll during AR
- Dynamic QR code to the live URL + PNG download
- Friendly errors: permission denied, no camera, no HTTPS, missing files
- Optional `DEBUG` panel (state, camera, video, FPS)

## How It Works

```text
QR CODE -> landing page -> [START AR] -> camera permission -> live camera
  -> MindAR detects assets/target.jpg -> video plane created once, shown
  -> <video> plays as Three.js texture anchored via addAnchor(0)
  -> phone/poster moves -> plane follows (position/rotation/scale)
  -> poster lost -> pause + hide -> poster found again -> resume
```

Key files: `index.html` (UI + importmap), `style.css`, `app.js` (all AR logic).

## Project Structure

```text
webar-video-ar/
├── index.html          # landing page + AR screen + importmap (MindAR/Three CDN)
├── style.css           # mobile-first + fullscreen camera CSS
├── app.js              # CONFIG + MindAR tracking + video texture + UI
├── README.md
├── .gitignore
├── assets/
│   ├── target.jpg      # printable poster / tracking source (SAMPLE included)
│   ├── target.mind     # <-- YOU GENERATE this (see below); required for tracking
│   └── video.mp4       # sample clip (REPLACE with yours, 720p H.264)
└── images/
    └── logo.png
```

## Requirements

- A phone with camera: Chrome on Android, Safari on iPhone (iOS 15+ recommended)
- The site served over **HTTPS** (GitHub Pages gives this free)
- `assets/target.mind` generated from your poster (one-time step)
- Desktop with webcam works for testing too (Chrome/Edge)

## Setup

```bash
git clone <your-repo-url>
cd webar-video-ar
# no build step — it's static. Serve over HTTPS (see Running Locally).
```

## Creating target.mind

`target.mind` is the compiled feature file MindAR actually tracks.
`target.jpg` alone is not enough. This project ships a sample `target.jpg`
but **you must generate `target.mind` yourself** (it cannot be hand-written).

```text
assets/target.jpg --MindAR Image Target Compiler--> assets/target.mind
```

1. Go to the official compiler: **https://hiukim.github.io/mind-ar-js-doc/tools/compile**
2. Drop in `assets/target.jpg` (or your own poster).
3. Wait for processing; check the feature-point overlay / star rating.
4. Download the resulting `.mind` file, rename to `target.mind`.
5. Place it at `assets/target.mind` (next to `target.jpg`).
6. Commit + push, redeploy Pages, hard-refresh the phone browser.

Tips for a trackable poster: high detail, strong contrast, distinct shapes,
non-repeating texture, no large blank areas. A plain white page with one small
logo will NOT track. The included sample poster was generated with dense
shapes/colors for this reason.

## Adding Your Video

1. Encode as **MP4, H.264 + AAC, yuv420p, ~720p** (1080p also works but heavier):
   ```bash
   ffmpeg -i input.mp4 -vf "scale=1280:-2" -c:v libx264 -pix_fmt yuv420p \
     -profile:v baseline -movflags +faststart -c:a aac assets/video.mp4
   ```
2. Overwrite `assets/video.mp4` (keep the name, or update `CONFIG.videoPath` in `app.js`).
3. Match the plane to your clip in `app.js`:
   ```js
   videoWidth: 1.0, videoHeight: 0.5625, // 16:9 — use 1.0 x 0.75 for 4:3
   ```

## Running Locally

Camera APIs are blocked on `file://`. Never just double-click `index.html`.

```bash
# Option A: Python HTTPS server (recommended, zero install beyond Python)
python -m http.server 8000              # then use a tunnel, or:
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 7 -nodes -subj "/CN=localhost"
python - <<'EOF'
from http.server import HTTPServer, SimpleHTTPRequestHandler
import ssl
httpd = HTTPServer(('0.0.0.0', 4443), SimpleHTTPRequestHandler)
httpd.socket = ssl.wrap_socket(httpd.socket, keyfile='key.pem', certfile='cert.pem', server_side=True)
print('https://localhost:4443 — accept the self-signed warning'); httpd.serve_forever()
EOF

# Option B: Node
npx --yes http-server -S -C cert.pem -K key.pem -p 4443 .

# Option C: Cloudflare tunnel (gives real HTTPS for phone testing)
npx --yes serve -l 8000 & npx --yes cloudflared tunnel --url http://localhost:8000
```

Then open the HTTPS URL on your phone (same network or tunnel URL).

## GitHub Pages Deployment

1. Create a GitHub repository (e.g. `webar-video-ar`).
2. Upload this project (`index.html` at repo root).
3. Commit + push to `main`:
   ```bash
   git init && git add -A && git commit -m "WebAR video experience"
   git branch -M main && git remote add origin https://github.com/YOUR-USERNAME/webar-video-ar.git
   git push -u origin main
   ```
4. Open repo **Settings → Pages**.
5. Source: **Deploy from a branch**, Branch: **main** / **(root)**.
6. Save. Wait ~1–2 min.
7. Open `https://YOUR-USERNAME.github.io/webar-video-ar/` on your phone (HTTPS ✓).

Replace `YOUR-USERNAME` with your GitHub username everywhere. The in-page QR
code uses the page's own URL automatically, so it is correct once deployed —
or pin it via `AR_URL` in `app.js`.

## HTTPS Requirement

Camera (`getUserMedia`) only works in [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts):
HTTPS or `localhost`. GitHub Pages provides HTTPS. `file://` will always fail
— the app shows a friendly error in that case.

## Android Testing

- [ ] Chrome (latest), HTTPS URL, camera permission Allowed
- [ ] Print `assets/target.jpg` at A4 or show fullscreen on a monitor
- [ ] START AR → point at poster → video appears + plays muted
- [ ] Move phone → video follows poster
- [ ] Cover poster → video pauses/hides; uncover → resumes
- [ ] 🔊 Sound → audio plays (must tap; starts muted by policy)
- [ ] ✕ Exit AR → back to landing, no stuck camera

## iPhone Testing

- [ ] Safari (iOS 15+), HTTPS URL, camera permission Allowed
- [ ] Same target/video/follow/pause checks as Android
- [ ] Notes: iOS always starts muted; unmute needs the 🔊 tap. If the camera
      shows black, kill other apps using the camera, check Settings →
      Safari → Camera = Allow, and reload. Behavior may differ slightly
      from Android — this is normal browser variation.

## QR Code

The landing page renders a QR from `AR_URL` (`app.js`, defaults to the page
URL) using a CDN QR library, with a **Download QR (PNG)** button. No
hard-coded fake URL: after Pages deploy, the QR is already correct. To pin a
canonical URL instead, set `const AR_URL = "https://YOUR-USERNAME.github.io/webar-video-ar/"`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "needs HTTPS / file://" | Serve over HTTPS or deploy to Pages; never double-click index.html |
| "allow camera access" loop | Browser blocked permission: tap 🔒 in address bar → allow camera → reload |
| No camera found / in use | Close other camera apps/tabs; on desktops without webcam test on phone |
| "target.mind was not found" | Generate it via the compiler link above into `assets/target.mind` |
| Camera runs, poster never detected | Print bigger, add light, avoid glare; use a detailed poster; ensure `.mind` matches the exact printed image; try fullscreen-on-monitor |
| Video black / not playing | Confirm `assets/video.mp4` is H.264+yuv420p; check network tab for 404; tap 🔊 once |
| Audio won't start | Required: tap 🔊 (autoplay-with-sound is blocked by browsers) |
| Page scrolls / layout broken | Use portrait, latest Chrome/Safari; AR screen locks scroll by design |
| Desktop works, phone fails | Almost always HTTP vs HTTPS or permission — recheck URL starts with https:// |

## Customization

All in `app.js`: `CONFIG.targetSrc/videoPath/videoWidth/videoHeight`,
`physicalWidthMm/HeightMm` (docs only — print size never needs code changes
as long as aspect ratio matches), `DEBUG = true` for the diagnostics panel.
Plane aspect must match the VIDEO, poster aspect must match `target.jpg`.

## Versions verified

- `mind-ar@1.2.5` (`mindar-image-three.prod.js` via jsDelivr)
- `three@0.160.0` (`unpkg.com`, importmap) — required pairing per
  https://hiukim.github.io/mind-ar-js-doc/more-examples/threejs-image
- MindAR ≥1.2 uses ES modules + external Three.js (no global `MINDAR` script).
