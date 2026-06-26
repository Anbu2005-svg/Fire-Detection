# EmberWatch Fire Detection

EmberWatch is an interactive fire and smoke screening website powered by an ONNX object-detection model.

## Features

- Image upload with browser-side optimization
- Webcam capture and continuous live analysis
- HTTP, HTTPS, RTSP, and RTSPS IP-camera viewing
- Adjustable detection sensitivity
- Browser notifications and audible hazard alerts
- Persistent detection history with annotated evidence
- Downloadable results
- Optional Supabase operator authentication
- Responsive React dashboard served by Flask

## Quick start

```powershell
.\start.ps1
```

Open `http://localhost:5000`.

## Manual setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

cd frontend
npm install
npm run build
cd ..

python app_flask.py
```

During frontend development, run these in separate terminals:

```powershell
python app_flask.py
```

```powershell
cd frontend
npm run dev
```

Vite serves the development UI at `http://localhost:3000` and proxies `/api` to Flask.

## Authentication

Authentication is optional. Copy `frontend/.env.example` to `frontend/.env`.

```env
VITE_AUTH_REQUIRED=false
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Set `VITE_AUTH_REQUIRED=true` and supply a Supabase project URL and anon key to require operator accounts. Rebuild the frontend after changing Vite environment variables.

## API

- `POST /api/detect` analyzes an uploaded image.
- `GET /api/stream?url=...` returns an analyzed MJPEG camera stream.
- `GET /api/history` lists recent analyses.
- `DELETE /api/history/:id` deletes one history item.
- `DELETE /api/history` clears all history.
- `GET /api/health` reports model availability.
- `GET /api/info` reports model and API configuration.

## Server configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MODEL_PATH` | `best.onnx` | ONNX model path |
| `CONFIDENCE_THRESHOLD` | `0.20` | Default minimum confidence |
| `IOU_THRESHOLD` | `0.45` | NMS overlap threshold |
| `INFERENCE_SIZE` | `960` | Fallback size for dynamic models; this model uses fixed `640` input |
| `MODEL_WARMUP` | `1` | Warm the model during startup |
| `MAX_UPLOAD_BYTES` | `12582912` | Maximum request size |
| `MAX_IMAGE_PIXELS` | `25000000` | Maximum decoded image area |
| `MAX_HISTORY_ITEMS` | `100` | Stored history retention |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Allowed cross-origin API callers for Vite development |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,::1` | Accepted HTTP Host headers |
| `ALLOWED_STREAM_HOSTS` | empty | Optional comma-separated IP-camera host allowlist |
| `API_RATE_LIMIT_REQUESTS` | `360` | API requests allowed per client and endpoint window |
| `API_RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate-limit window in seconds |
| `SECURITY_HEADERS` | `1` | Send browser security headers |
| `CONTENT_SECURITY_POLICY` | secure default | Override the default CSP if needed |
| `HOST` | `127.0.0.1` | Flask bind address; set `0.0.0.0` only for trusted LAN/deployments |
| `PORT` | `5000` | Flask port |
| `FLASK_DEBUG` | `0` | Enable Flask debug mode |

Detection history and evidence images are stored under `data/`.

By default the server is local-only. If you expose it to another device, set `HOST=0.0.0.0`, add the public hostname or LAN IP to `ALLOWED_HOSTS`, and keep `CORS_ORIGINS` restricted to trusted frontend origins. IP-camera streaming accepts private camera IP addresses by default; public hosts and loopback/link-local targets are blocked unless explicitly allowlisted.

## Standalone webcam

`app.py` runs the model in a native OpenCV window:

```powershell
python app.py
```

Press `Q` or `Esc` to close it.

## Safety

EmberWatch provides visual decision support. It is not a replacement for certified smoke alarms, fire sensors, trained personnel, or emergency procedures.
