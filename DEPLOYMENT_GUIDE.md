# Deployment Guide

## Local development

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app_flask.py
```

The dashboard is served from `http://localhost:5000`.

## Production process

Use a production WSGI server and one worker per model instance. The application protects each in-process model with an inference lock, so additional threads queue instead of accessing the same YOLO object concurrently.

Example with Waitress on Windows:

```powershell
pip install waitress
$env:ALLOWED_HOSTS="your-domain.example,127.0.0.1"
$env:CORS_ORIGINS="https://your-domain.example"
waitress-serve --host=0.0.0.0 --port=5000 app_flask:app
```

Example with Gunicorn on Linux:

```bash
pip install gunicorn
export ALLOWED_HOSTS="your-domain.example,127.0.0.1"
export CORS_ORIGINS="https://your-domain.example"
gunicorn --workers 1 --threads 4 --bind 0.0.0.0:5000 app_flask:app
```

Scale with additional processes only when the host has enough memory for one model copy per process. For GPU deployments, benchmark worker count carefully because each process can allocate GPU memory.

## Supabase authentication

Set Supabase variables in the root `.env` file. Vite reads frontend `VITE_` values from the root because `frontend/vite.config.js` sets `envDir: '..'`.

```powershell
Copy-Item .env.example .env
notepad .env
cd frontend
npm run build
cd ..
```

For production process managers, the equivalent environment variables are:

```powershell
$env:VITE_AUTH_REQUIRED="true"
$env:VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="your_supabase_anon_key"
$env:SUPABASE_AUTH_REQUIRED="1"
$env:SUPABASE_JWT_SECRET="your_supabase_jwt_secret"
```

The frontend anon key is safe to expose in the browser. The JWT secret is server-only and must never be committed.

## Server-side notifications

Telegram bot notifications are the recommended free alert channel. Store tokens only in environment variables or a local `.env` file that is not committed.

```powershell
$env:NOTIFICATION_CHANNELS="telegram"
$env:TELEGRAM_BOT_TOKEN="123456:your_bot_token"
$env:TELEGRAM_CHAT_ID="123456789"
$env:SERVER_PUBLIC_URL="https://your-domain.example"
```

Send a test alert after startup:

```powershell
Invoke-RestMethod -Method Post https://your-domain.example/api/notifications/test
```

For custom alert pipelines, set `WEBHOOK_URL` and `NOTIFICATION_CHANNELS=telegram,webhook`. The webhook receives JSON with the event name, alert message, detection metadata, and evidence URL.

## Reverse proxy

Place the app behind HTTPS in production. Configure the proxy to:

- Allow request bodies up to the `MAX_UPLOAD_BYTES` value.
- Use an inference-friendly timeout such as 120 seconds.
- Forward the original host and protocol headers.
- Apply compression to HTML, CSS, JavaScript, and JSON responses.

## Container outline

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV PORT=5000
EXPOSE 5000
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--bind", "0.0.0.0:5000", "app_flask:app"]
```

Add `gunicorn` to the image installation step when using this example.

## Health check

Use `GET /api/health`. A healthy response has `model_loaded: true`. A server can still respond while reporting a degraded state if the model failed to load.

## Performance notes

- The browser downsizes large images to a 1600-pixel maximum edge and sends multipart data to avoid base64 request overhead.
- Server inference defaults to `INFERENCE_SIZE=960`; lower values are faster and may reduce small-object accuracy.
- Annotated results are returned as optimized JPEG images.
- Repeated requests are serialized per model instance for predictable inference behavior.
- The model warms up during server startup by default, avoiding a large one-time delay on the first user request.

## Security notes

- Only the required frontend assets are publicly served; model and source files are not exposed by the static route.
- Upload MIME type, byte size, decoded dimensions, and image validity are checked.
- The local development server binds to `127.0.0.1` by default. Bind to `0.0.0.0` only for trusted LAN or production deployments.
- Set `ALLOWED_HOSTS` to the exact production hostname or LAN IP before exposing the app.
- Keep `CORS_ORIGINS` restricted to trusted frontend origins when the API is exposed separately.
- IP-camera streams allow private camera IP addresses by default. Add named cameras to `ALLOWED_STREAM_HOSTS`; do not use `*` on an internet-facing server.
- API routes send no-store cache headers, rate-limit repeated calls, and add browser security headers by default.
- Keep `SUPABASE_JWT_SECRET` server-side only. The frontend uses only the Supabase anon key.
- Keep `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `WEBHOOK_URL` out of source control.
- Keep debug mode disabled in production.
