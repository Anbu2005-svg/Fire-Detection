# EmberWatch Fire Detection

EmberWatch is an interactive fire and smoke screening website powered by an ONNX object-detection model.

## Features

- Image upload with browser-side optimization
- Webcam capture and continuous live analysis
- HTTP, HTTPS, RTSP, and RTSPS IP-camera viewing
- Adjustable detection sensitivity
- Browser notifications and audible hazard alerts
- Free server-side Telegram alerts and optional webhook alerts
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

## Supabase authentication

Authentication is powered by Supabase Auth. Copy the single root `.env.example` file to `.env`; both Flask and Vite read from that same file.

```powershell
Copy-Item .env.example .env
```

Supabase values in root `.env`:

```env
VITE_AUTH_REQUIRED=true
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_AUTH_REQUIRED=1
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
```

Create a Supabase project, then open **Authentication > Providers** and keep Email enabled. Add these redirect URLs in Supabase:

```text
http://127.0.0.1:5000/reset-password
http://localhost:5000/reset-password
http://127.0.0.1:3000/reset-password
http://localhost:3000/reset-password
```

Find the frontend URL and anon key in **Project Settings > API**. Find the backend JWT secret in **Project Settings > API > JWT Settings**. Rebuild the frontend after changing root `.env` values because Vite embeds `VITE_` variables at build time.

To run without login for a local demo, set `VITE_AUTH_REQUIRED=false` and `SUPABASE_AUTH_REQUIRED=0`.

## Server-side notifications

Telegram is the recommended free server-side alert method. SMS and WhatsApp usually need a paid provider account, while Telegram bot messages can be sent directly from Flask with a bot token and chat ID. Webhooks are also supported for custom integrations.

1. In Telegram, message `@BotFather` and create a bot with `/newbot`.
2. Edit the root `.env` file.
3. Paste the bot token into `TELEGRAM_BOT_TOKEN`.
4. Send any message to your new bot.
5. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and copy `message.chat.id` into `TELEGRAM_CHAT_ID`.
6. Restart Flask and test:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:5000/api/notifications/test
```

Minimal `.env` example:

```env
NOTIFICATION_CHANNELS=telegram
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_CHAT_ID=123456789
SERVER_PUBLIC_URL=http://127.0.0.1:5000
```

For a webhook receiver, set `WEBHOOK_URL=https://example.com/alerts` and use `NOTIFICATION_CHANNELS=telegram,webhook`.

## API

- `POST /api/detect` analyzes an uploaded image.
- `GET /api/stream?url=...` returns an analyzed MJPEG camera stream.
- `GET /api/history` lists recent analyses.
- `DELETE /api/history/:id` deletes one history item.
- `DELETE /api/history` clears all history.
- `POST /api/notifications/test` sends a test server-side notification.
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
| `SUPABASE_AUTH_REQUIRED` | `0` | Require valid Supabase access tokens for protected API routes |
| `SUPABASE_JWT_SECRET` | empty | Supabase JWT secret used by Flask to verify access tokens |
| `SERVER_PUBLIC_URL` | empty | Public URL used in notification evidence links |
| `NOTIFICATION_ENABLED` | `1` | Enable server-side Telegram/webhook alerts |
| `NOTIFICATION_CHANNELS` | inferred | Comma-separated `telegram`, `webhook`, or both |
| `NOTIFICATION_COOLDOWN_SECONDS` | `120` | Minimum seconds between server-side alerts |
| `NOTIFICATION_MIN_CONFIDENCE` | `0` | Minimum top confidence percent required before alerting |
| `TELEGRAM_BOT_TOKEN` | empty | Telegram bot token from `@BotFather` |
| `TELEGRAM_CHAT_ID` | empty | Telegram user/group chat ID |
| `WEBHOOK_URL` | empty | Optional HTTP/HTTPS webhook receiver |
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
