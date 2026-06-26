"""Flask server for the EmberWatch fire detection interface using ONNX Runtime."""

from __future__ import annotations

import base64
import binascii
import ipaddress
import io
import json
import os
import sqlite3
import threading
import time
from collections import Counter, deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib import error as urllib_error
from urllib import request as urllib_request

import cv2
import numpy as np
import onnxruntime as ort
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.utils import safe_join


BASE_DIR = Path(__file__).resolve().parent


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file(BASE_DIR / ".env")

FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DETECTION_DIR = DATA_DIR / "detections"
DATABASE_PATH = DATA_DIR / "emberwatch.db"
MODEL_PATH = Path(os.getenv("MODEL_PATH", BASE_DIR / "best.onnx"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.20"))
IOU_THRESHOLD = float(os.getenv("IOU_THRESHOLD", "0.45"))
INFERENCE_SIZE = int(os.getenv("INFERENCE_SIZE", "960"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "25000000"))
MODEL_WARMUP = os.getenv("MODEL_WARMUP", "1") == "1"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_STREAM_SCHEMES = {"http", "https", "rtsp", "rtsps"}
MAX_HISTORY_ITEMS = int(os.getenv("MAX_HISTORY_ITEMS", "100"))
ALLOWED_HOSTS = tuple(
    host.strip().lower()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,::1").split(",")
    if host.strip()
)
ALLOWED_STREAM_HOSTS = tuple(
    host.strip().lower()
    for host in os.getenv("ALLOWED_STREAM_HOSTS", "").split(",")
    if host.strip()
)
API_RATE_LIMIT_REQUESTS = int(os.getenv("API_RATE_LIMIT_REQUESTS", "360"))
API_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("API_RATE_LIMIT_WINDOW_SECONDS", "60"))
SECURITY_HEADERS_ENABLED = os.getenv("SECURITY_HEADERS", "1") != "0"
DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
SERVER_PUBLIC_URL = os.getenv("SERVER_PUBLIC_URL", "").strip().rstrip("/")
NOTIFICATION_ENABLED = os.getenv("NOTIFICATION_ENABLED", "1") != "0"
NOTIFICATION_CHANNELS_RAW = os.getenv("NOTIFICATION_CHANNELS", "").strip()
NOTIFICATION_COOLDOWN_SECONDS = int(os.getenv("NOTIFICATION_COOLDOWN_SECONDS", "120"))
NOTIFICATION_TIMEOUT_SECONDS = float(os.getenv("NOTIFICATION_TIMEOUT_SECONDS", "8"))
NOTIFICATION_MIN_CONFIDENCE = float(os.getenv("NOTIFICATION_MIN_CONFIDENCE", "0"))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "").strip()

# Class names for the fire detection model
CLASS_NAMES = {0: "fire", 1: "smoke"}
# Colors for drawing bounding boxes (BGR for OpenCV)
CLASS_COLORS = {0: (0, 70, 255), 1: (255, 160, 50)}

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
DETECTION_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
if CORS_ORIGINS:
    CORS(app, resources={r"/api/*": {"origins": CORS_ORIGINS}})

inference_lock = threading.Lock()
database_lock = threading.Lock()
live_history_lock = threading.Lock()
rate_limit_lock = threading.Lock()
notification_lock = threading.Lock()
rate_limit_hits: dict[str, deque[float]] = {}
last_live_history_at = 0.0
last_notification_at = 0.0


def _normalize_hostname(host_value: str) -> str:
    host_value = (host_value or "").strip().lower()
    if not host_value:
        return ""
    if host_value.startswith("["):
        return host_value[1:].split("]", 1)[0]
    return host_value.split(":", 1)[0]


def _host_is_allowed(hostname: str, allowed_hosts: tuple[str, ...]) -> bool:
    if not allowed_hosts or "*" in allowed_hosts:
        return True
    hostname = hostname.rstrip(".")
    for allowed in allowed_hosts:
        allowed = allowed.rstrip(".")
        if allowed.startswith("*.") and hostname.endswith(allowed[1:]):
            return True
        if hostname == allowed:
            return True
    return False


def _client_rate_limit_key() -> str:
    client_ip = request.remote_addr or "unknown"
    endpoint = request.endpoint or request.path
    return f"{client_ip}:{endpoint}"


def _rate_limit_response():
    if API_RATE_LIMIT_REQUESTS <= 0 or API_RATE_LIMIT_WINDOW_SECONDS <= 0:
        return None

    now = time.monotonic()
    window_start = now - API_RATE_LIMIT_WINDOW_SECONDS
    key = _client_rate_limit_key()

    with rate_limit_lock:
        hits = rate_limit_hits.setdefault(key, deque())
        while hits and hits[0] < window_start:
            hits.popleft()
        if len(hits) >= API_RATE_LIMIT_REQUESTS:
            retry_after = max(1, int(API_RATE_LIMIT_WINDOW_SECONDS - (now - hits[0])))
            response = jsonify(
                {
                    "success": False,
                    "error": "Too many requests. Please slow down and try again.",
                }
            )
            response.headers["Retry-After"] = str(retry_after)
            return response, 429
        hits.append(now)
    return None


def _ip_is_allowed_camera_target(ip_address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return (
        ip_address.is_private
        and not ip_address.is_loopback
        and not ip_address.is_link_local
        and not ip_address.is_multicast
        and not ip_address.is_reserved
        and not ip_address.is_unspecified
    )


def _stream_hostname_is_allowed(hostname: str) -> bool:
    normalized = hostname.strip().rstrip(".").lower()
    if ALLOWED_STREAM_HOSTS and _host_is_allowed(normalized, ALLOWED_STREAM_HOSTS):
        return True

    try:
        return _ip_is_allowed_camera_target(ipaddress.ip_address(normalized))
    except ValueError:
        return False


def _configured_notification_channels() -> list[str]:
    if not NOTIFICATION_ENABLED:
        return []

    requested = {
        channel.strip().lower()
        for channel in NOTIFICATION_CHANNELS_RAW.split(",")
        if channel.strip()
    }
    if not requested:
        requested = set()
        if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
            requested.add("telegram")
        if WEBHOOK_URL:
            requested.add("webhook")

    channels: list[str] = []
    if "telegram" in requested and TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        channels.append("telegram")
    if "webhook" in requested and _webhook_url_is_valid(WEBHOOK_URL):
        channels.append("webhook")
    return channels


def _webhook_url_is_valid(url: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.netloc)


def _public_url_for_path(path: str) -> str | None:
    if not SERVER_PUBLIC_URL:
        return None
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{SERVER_PUBLIC_URL}{path}"


def _format_label_counts(labels: dict) -> str:
    if not labels:
        return "fire or smoke"
    return ", ".join(f"{label}: {count}" for label, count in labels.items())


def _build_notification_message(history_item: dict) -> str:
    source = history_item["source"].replace("-", " ")
    labels = _format_label_counts(history_item.get("labels", {}))
    created_at = history_item["created_at"].replace("T", " ").replace("+00:00", " UTC")
    lines = [
        "EmberWatch hazard alert",
        f"Source: {source}",
        f"Detections: {history_item['detection_count']}",
        f"Labels: {labels}",
        f"Top confidence: {history_item['top_confidence']:.1f}%",
        f"Time: {created_at}",
    ]

    evidence_url = _public_url_for_path(history_item.get("image_url", ""))
    if evidence_url:
        lines.append(f"Evidence: {evidence_url}")
    return "\n".join(lines)


def _post_json(url: str, payload: dict) -> None:
    parsed = urlparse(url)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError("Notification URL must use HTTP or HTTPS")

    body = json.dumps(payload).encode("utf-8")
    request_obj = urllib_request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "EmberWatch/3.0",
        },
        method="POST",
    )
    with urllib_request.urlopen(request_obj, timeout=NOTIFICATION_TIMEOUT_SECONDS) as response:  # nosec B310
        if not 200 <= response.status < 300:
            raise RuntimeError(f"Notification endpoint returned HTTP {response.status}")


def _send_telegram_notification(message: str) -> None:
    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    _post_json(
        api_url,
        {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "disable_web_page_preview": False,
        },
    )


def _send_webhook_notification(history_item: dict, message: str) -> None:
    _post_json(
        WEBHOOK_URL,
        {
            "event": "emberwatch.hazard_detected",
            "message": message,
            "detection": history_item,
            "evidence_url": _public_url_for_path(history_item.get("image_url", "")),
            "sent_at": datetime.now(timezone.utc).isoformat(),
        },
    )


def _should_send_server_notification(history_item: dict) -> bool:
    global last_notification_at

    if not history_item.get("hazard_detected"):
        return False
    if history_item.get("top_confidence", 0) < NOTIFICATION_MIN_CONFIDENCE:
        return False
    if not _configured_notification_channels():
        return False

    with notification_lock:
        now = time.monotonic()
        if now - last_notification_at < NOTIFICATION_COOLDOWN_SECONDS:
            return False
        last_notification_at = now
        return True


def _send_server_notifications(history_item: dict) -> list[dict]:
    message = _build_notification_message(history_item)
    results = []
    for channel in _configured_notification_channels():
        try:
            if channel == "telegram":
                _send_telegram_notification(message)
            elif channel == "webhook":
                _send_webhook_notification(history_item, message)
            app.logger.info("Sent %s notification for detection %s", channel, history_item["id"])
            results.append({"channel": channel, "success": True})
        except (urllib_error.URLError, TimeoutError, RuntimeError, OSError):
            app.logger.exception(
                "Unable to send %s notification for detection %s",
                channel,
                history_item["id"],
            )
            results.append({"channel": channel, "success": False})
    return results


def _notify_hazard_async(history_item: dict) -> None:
    if not _should_send_server_notification(history_item):
        return

    worker = threading.Thread(
        target=_send_server_notifications,
        args=(history_item,),
        daemon=True,
        name="emberwatch-notifier",
    )
    worker.start()


def _notification_status() -> dict:
    return {
        "enabled": NOTIFICATION_ENABLED,
        "configured_channels": _configured_notification_channels(),
        "cooldown_seconds": NOTIFICATION_COOLDOWN_SECONDS,
        "minimum_confidence": NOTIFICATION_MIN_CONFIDENCE,
        "public_url_configured": bool(SERVER_PUBLIC_URL),
    }


def _database_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _delete_evidence_file(filename: str, attempt: int = 0) -> None:
    path = DETECTION_DIR / filename
    try:
        path.unlink(missing_ok=True)
    except PermissionError:
        if attempt >= 3:
            app.logger.warning("Evidence file is still in use and could not be removed: %s", filename)
            return
        retry = threading.Timer(0.5 * (attempt + 1), _delete_evidence_file, (filename, attempt + 1))
        retry.daemon = True
        retry.start()
    except OSError:
        app.logger.exception("Unable to remove evidence file: %s", filename)


def _initialize_database() -> None:
    with database_lock, _database_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                source TEXT NOT NULL,
                hazard_detected INTEGER NOT NULL,
                detection_count INTEGER NOT NULL,
                top_confidence REAL NOT NULL,
                average_confidence REAL NOT NULL,
                inference_ms REAL NOT NULL,
                processing_ms REAL NOT NULL,
                labels_json TEXT NOT NULL,
                image_filename TEXT NOT NULL
            )
            """
        )


_initialize_database()


# ---------------------------------------------------------------------------
# ONNX model loading
# ---------------------------------------------------------------------------
session: ort.InferenceSession | None = None
input_name: str = ""
input_shape: tuple = ()

try:
    available_providers = ort.get_available_providers()
    providers = [
        provider
        for provider in ("CUDAExecutionProvider", "CPUExecutionProvider")
        if provider in available_providers
    ]
    session = ort.InferenceSession(str(MODEL_PATH), providers=providers)
    meta = session.get_inputs()[0]
    input_name = meta.name
    input_shape = tuple(meta.shape)  # e.g. [1, 3, 960, 960]
    if MODEL_WARMUP:
        warmup_size = (
            input_shape[2]
            if len(input_shape) == 4 and isinstance(input_shape[2], int)
            else INFERENCE_SIZE
        )
        session.run(
            None,
            {input_name: np.zeros((1, 3, warmup_size, warmup_size), dtype=np.float32)},
        )
    app.logger.info(
        "Loaded ONNX model from %s  input=%s  shape=%s",
        MODEL_PATH.name, input_name, input_shape,
    )
except Exception:
    app.logger.exception("Unable to load ONNX model from %s", MODEL_PATH)
    session = None


@app.before_request
def enforce_request_security():
    hostname = _normalize_hostname(request.host)
    if not _host_is_allowed(hostname, ALLOWED_HOSTS):
        return jsonify({"success": False, "error": "Host header is not allowed"}), 400

    if request.path.startswith("/api/"):
        limited_response = _rate_limit_response()
        if limited_response is not None:
            return limited_response

    return None


# ---------------------------------------------------------------------------
# ONNX pre/post-processing helpers
# ---------------------------------------------------------------------------

def _letterbox(img: np.ndarray, new_shape: int) -> tuple[np.ndarray, float, tuple[int, int]]:
    """Resize image with letterboxing to preserve aspect ratio."""
    h, w = img.shape[:2]
    scale = min(new_shape / h, new_shape / w)
    new_h, new_w = int(round(h * scale)), int(round(w * scale))
    img_resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    dw = new_shape - new_w
    dh = new_shape - new_h
    top, left = dh // 2, dw // 2

    padded = np.full((new_shape, new_shape, 3), 114, dtype=np.uint8)
    padded[top : top + new_h, left : left + new_w] = img_resized
    return padded, scale, (top, left)


def _preprocess(img_rgb: np.ndarray, imgsz: int) -> tuple[np.ndarray, float, tuple[int, int]]:
    """Prepare an RGB image for ONNX inference."""
    padded, scale, pad = _letterbox(img_rgb, imgsz)
    blob = padded.astype(np.float32) / 255.0
    blob = blob.transpose(2, 0, 1)[np.newaxis]  # HWC -> 1CHW
    return blob, scale, pad


def _postprocess(
    output: np.ndarray,
    conf_threshold: float,
    iou_threshold: float,
    scale: float,
    pad: tuple[int, int],
    orig_h: int,
    orig_w: int,
) -> list[dict]:
    """Run NMS and rescale boxes back to original image coordinates.
    
    Supports both YOLOv8 output formats:
      - (1, num_classes+4, num_detections)  — needs transpose
      - (1, num_detections, num_classes+4)  — standard
    """
    preds = output[0]  # Remove batch dim

    # YOLOv8 exports as (4+nc, N) — transpose to (N, 4+nc)
    if preds.shape[0] < preds.shape[1]:
        preds = preds.T

    num_classes = preds.shape[1] - 4
    boxes_xywh = preds[:, :4]
    class_scores = preds[:, 4:]

    max_scores = class_scores.max(axis=1)
    mask = max_scores > conf_threshold
    boxes_xywh = boxes_xywh[mask]
    class_scores = class_scores[mask]
    max_scores = max_scores[mask]
    class_ids = class_scores.argmax(axis=1)

    if len(boxes_xywh) == 0:
        return []

    # xywh -> xyxy
    x, y, w, h = boxes_xywh[:, 0], boxes_xywh[:, 1], boxes_xywh[:, 2], boxes_xywh[:, 3]
    x1 = x - w / 2
    y1 = y - h / 2
    x2 = x + w / 2
    y2 = y + h / 2
    boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)

    # Remove letterbox padding and rescale
    pad_top, pad_left = pad
    boxes_xyxy[:, [0, 2]] = (boxes_xyxy[:, [0, 2]] - pad_left) / scale
    boxes_xyxy[:, [1, 3]] = (boxes_xyxy[:, [1, 3]] - pad_top) / scale

    # Clip to image bounds
    boxes_xyxy[:, [0, 2]] = np.clip(boxes_xyxy[:, [0, 2]], 0, orig_w)
    boxes_xyxy[:, [1, 3]] = np.clip(boxes_xyxy[:, [1, 3]], 0, orig_h)

    # OpenCV NMS
    boxes_for_nms = [
        [
            int(x1),
            int(y1),
            max(1, int(x2 - x1)),
            max(1, int(y2 - y1)),
        ]
        for x1, y1, x2, y2 in boxes_xyxy
    ]
    scores_for_nms = max_scores.tolist()
    indices = cv2.dnn.NMSBoxes(
        boxes_for_nms,
        scores_for_nms,
        conf_threshold,
        iou_threshold,
    )

    results = []
    if len(indices) > 0:
        indices = indices.flatten()
        for i in indices:
            results.append(
                {
                    "box": boxes_xyxy[i].tolist(),
                    "confidence": float(max_scores[i]),
                    "class_id": int(class_ids[i]),
                    "label": CLASS_NAMES.get(int(class_ids[i]), f"class_{class_ids[i]}"),
                }
            )
    return results


def _draw_detections(img_rgb: np.ndarray, detections: list[dict]) -> np.ndarray:
    """Draw bounding boxes and labels on image (works in RGB)."""
    img = img_rgb.copy()
    for det in detections:
        x1, y1, x2, y2 = [int(v) for v in det["box"]]
        color = CLASS_COLORS.get(det["class_id"], (0, 255, 0))
        # Convert BGR color to RGB for drawing
        color_rgb = (color[2], color[1], color[0])

        cv2.rectangle(img, (x1, y1), (x2, y2), color_rgb, 2)

        label = f'{det["label"]} {det["confidence"]:.0%}'
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
        cv2.rectangle(img, (x1, y1 - th - 8), (x1 + tw + 4, y1), color_rgb, -1)
        cv2.putText(
            img, label, (x1 + 2, y1 - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA,
        )
    return img


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.post("/api/detect")
def detect():
    if session is None:
        return jsonify({"success": False, "error": "Detection model is unavailable"}), 503

    try:
        processing_started_at = time.perf_counter()
        conf_val = request.form.get("confidence") or request.args.get("confidence")
        conf = float(conf_val) if conf_val is not None else CONFIDENCE_THRESHOLD
        if not 0.05 <= conf <= 0.95:
            raise ValueError("Confidence must be between 0.05 and 0.95")

        # Override with model's expected shape if it has fixed dimensions (NCHW)
        imgsz = INFERENCE_SIZE
        if len(input_shape) == 4 and isinstance(input_shape[2], int) and isinstance(input_shape[3], int):
            imgsz = input_shape[2]

        image = _read_request_image()
        image_array = np.asarray(image)
        orig_h, orig_w = image_array.shape[:2]

        blob, scale, pad = _preprocess(image_array, imgsz)

        started_at = time.perf_counter()
        with inference_lock:
            outputs = session.run(None, {input_name: blob})
        elapsed_ms = (time.perf_counter() - started_at) * 1000

        detections = _postprocess(
            outputs[0], conf, IOU_THRESHOLD, scale, pad, orig_h, orig_w,
        )

        detection_count = len(detections)
        confidence_values = [d["confidence"] for d in detections]
        label_counts = Counter(d["label"] for d in detections)

        annotated = _draw_detections(image_array, detections)
        output_buf = io.BytesIO()
        Image.fromarray(annotated).save(output_buf, format="JPEG", quality=88, optimize=True)
        output_bytes = output_buf.getvalue()
        encoded_image = base64.b64encode(output_bytes).decode("ascii")
        processing_ms = (time.perf_counter() - processing_started_at) * 1000
        source = _sanitize_source(request.form.get("source") or "upload")
        history_item = None
        if _should_record_detection(source, detection_count):
            history_item = _record_detection(
                source=source,
                detection_count=detection_count,
                confidence_values=confidence_values,
                label_counts=label_counts,
                inference_ms=elapsed_ms,
                processing_ms=processing_ms,
                image_bytes=output_bytes,
            )
            _notify_hazard_async(history_item)

        return jsonify(
            {
                "success": True,
                "image": f"data:image/jpeg;base64,{encoded_image}",
                "detections": detection_count,
                "confidence": round(max(confidence_values, default=0) * 100, 2),
                "average_confidence": round(
                    (sum(confidence_values) / len(confidence_values) if confidence_values else 0) * 100,
                    2,
                ),
                "fire_detected": detection_count > 0,
                "labels": dict(label_counts),
                "inference_ms": round(elapsed_ms, 1),
                "processing_ms": round(processing_ms, 1),
                "history_item": history_item,
            }
        )
    except ValueError as error:
        return jsonify({"success": False, "error": str(error)}), 400
    except (UnidentifiedImageError, OSError):
        return jsonify({"success": False, "error": "The uploaded file is not a valid image"}), 400
    except Exception:
        app.logger.exception("Detection request failed")
        return jsonify({"success": False, "error": "Detection failed on the server"}), 500


def _read_request_image() -> Image.Image:
    uploaded_file = request.files.get("image")

    if uploaded_file is not None:
        if uploaded_file.mimetype not in ALLOWED_IMAGE_TYPES:
            raise ValueError("Only JPG, PNG, and WebP images are supported")
        image_bytes = uploaded_file.read()
    else:
        data = request.get_json(silent=True) or {}
        image_data = data.get("image")
        if not isinstance(image_data, str) or not image_data:
            raise ValueError("No image was provided")

        if image_data.startswith("data:image"):
            try:
                image_data = image_data.split(",", 1)[1]
            except IndexError as error:
                raise ValueError("The image data URL is malformed") from error

        try:
            image_bytes = base64.b64decode(image_data, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("The base64 image data is invalid") from error

    if not image_bytes:
        raise ValueError("The uploaded image is empty")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("The uploaded image is too large")

    image = Image.open(io.BytesIO(image_bytes))
    if image.width * image.height > MAX_IMAGE_PIXELS:
        raise ValueError("The image dimensions are too large")

    image.load()
    image = ImageOps.exif_transpose(image)
    return image.convert("RGB")


def _sanitize_source(source: str) -> str:
    normalized = source.strip().lower().replace(" ", "-")
    return normalized if normalized in {"upload", "camera", "live-camera", "ip-camera"} else "upload"


def _should_record_detection(source: str, detection_count: int) -> bool:
    global last_live_history_at

    persist_value = (request.form.get("persist") or "true").strip().lower()
    if persist_value in {"false", "0", "no"}:
        return False
    if source != "live-camera":
        return True
    if detection_count == 0:
        return False

    with live_history_lock:
        now = time.monotonic()
        if now - last_live_history_at < 30:
            return False
        last_live_history_at = now
        return True


def _record_detection(
    *,
    source: str,
    detection_count: int,
    confidence_values: list[float],
    label_counts: Counter,
    inference_ms: float,
    processing_ms: float,
    image_bytes: bytes,
) -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    filename = f"detection-{time.time_ns()}.jpg"
    (DETECTION_DIR / filename).write_bytes(image_bytes)
    top_confidence = max(confidence_values, default=0) * 100
    average_confidence = (
        sum(confidence_values) / len(confidence_values) * 100 if confidence_values else 0
    )

    with database_lock, _database_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO detections (
                created_at, source, hazard_detected, detection_count,
                top_confidence, average_confidence, inference_ms,
                processing_ms, labels_json, image_filename
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                created_at,
                source,
                int(detection_count > 0),
                detection_count,
                top_confidence,
                average_confidence,
                inference_ms,
                processing_ms,
                json.dumps(dict(label_counts)),
                filename,
            ),
        )
        item_id = cursor.lastrowid
        stale_rows = connection.execute(
            """
            SELECT id, image_filename FROM detections
            ORDER BY id DESC LIMIT -1 OFFSET ?
            """,
            (MAX_HISTORY_ITEMS,),
        ).fetchall()
        for row in stale_rows:
            connection.execute("DELETE FROM detections WHERE id = ?", (row["id"],))
            _delete_evidence_file(row["image_filename"])

    return {
        "id": item_id,
        "created_at": created_at,
        "source": source,
        "hazard_detected": detection_count > 0,
        "detection_count": detection_count,
        "top_confidence": round(top_confidence, 2),
        "average_confidence": round(average_confidence, 2),
        "inference_ms": round(inference_ms, 1),
        "processing_ms": round(processing_ms, 1),
        "labels": dict(label_counts),
        "image_url": f"/api/history/{item_id}/image",
    }


def _serialize_history_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "source": row["source"],
        "hazard_detected": bool(row["hazard_detected"]),
        "detection_count": row["detection_count"],
        "top_confidence": round(row["top_confidence"], 2),
        "average_confidence": round(row["average_confidence"], 2),
        "inference_ms": round(row["inference_ms"], 1),
        "processing_ms": round(row["processing_ms"], 1),
        "labels": json.loads(row["labels_json"]),
        "image_url": f"/api/history/{row['id']}/image",
    }


def generate_ip_camera_stream(stream_url: str, conf: float, imgsz: int):
    """Generator function to read from IP camera, run inference, and yield MJPEG frames."""
    cap = cv2.VideoCapture(stream_url)
    
    # Try to lower buffer size to minimize latency for RTSP streams
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    try:
        while True:
            ret, frame_bgr = cap.read()
            if not ret:
                break

            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            orig_h, orig_w = frame_rgb.shape[:2]
            blob, scale, pad = _preprocess(frame_rgb, imgsz)

            with inference_lock:
                if session is None:
                    break
                outputs = session.run(None, {input_name: blob})

            detections = _postprocess(
                outputs[0], conf, IOU_THRESHOLD, scale, pad, orig_h, orig_w,
            )

            annotated_rgb = _draw_detections(frame_rgb, detections)
            status_color_rgb = (255, 70, 70) if detections else (86, 214, 160)
            cv2.putText(
                annotated_rgb,
                f"Alerts: {len(detections)}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                status_color_rgb,
                2,
            )
            annotated_bgr = cv2.cvtColor(annotated_rgb, cv2.COLOR_RGB2BGR)

            encoded, buffer = cv2.imencode(
                ".jpg", annotated_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 80]
            )
            if not encoded:
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + buffer.tobytes()
                + b"\r\n"
            )
    finally:
        cap.release()


@app.get("/api/stream")
def stream():
    url = request.args.get("url")
    if not url:
        return jsonify({"success": False, "error": "No IP Camera URL provided"}), 400

    parsed_url = urlparse(url)
    if parsed_url.scheme.lower() not in ALLOWED_STREAM_SCHEMES or not parsed_url.hostname:
        return jsonify(
            {
                "success": False,
                "error": "Use a valid HTTP, HTTPS, RTSP, or RTSPS camera URL",
            }
        ), 400
    if not _stream_hostname_is_allowed(parsed_url.hostname):
        return jsonify(
            {
                "success": False,
                "error": (
                    "Camera URL host is not allowed. Use a private camera IP address "
                    "or add the host to ALLOWED_STREAM_HOSTS."
                ),
            }
        ), 400

    conf_val = request.args.get("confidence")
    try:
        conf = float(conf_val) if conf_val is not None else CONFIDENCE_THRESHOLD
    except ValueError:
        return jsonify({"success": False, "error": "Invalid confidence value"}), 400
    if not 0.05 <= conf <= 0.95:
        return jsonify({"success": False, "error": "Invalid confidence value"}), 400

    imgsz = INFERENCE_SIZE
    if len(input_shape) == 4 and isinstance(input_shape[2], int) and isinstance(input_shape[3], int):
        imgsz = input_shape[2]

    return Response(
        generate_ip_camera_stream(url, conf, imgsz),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


@app.get("/api/history")
def detection_history():
    limit = min(max(request.args.get("limit", default=20, type=int), 1), 100)
    with database_lock, _database_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM detections ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return jsonify({"success": True, "items": [_serialize_history_row(row) for row in rows]})


@app.get("/api/history/<int:item_id>/image")
def detection_history_image(item_id: int):
    with database_lock, _database_connection() as connection:
        row = connection.execute(
            "SELECT image_filename FROM detections WHERE id = ?",
            (item_id,),
        ).fetchone()
    if row is None:
        return jsonify({"success": False, "error": "History item not found"}), 404
    return send_from_directory(DETECTION_DIR, row["image_filename"], max_age=3600)


@app.delete("/api/history/<int:item_id>")
def delete_history_item(item_id: int):
    with database_lock, _database_connection() as connection:
        row = connection.execute(
            "SELECT image_filename FROM detections WHERE id = ?",
            (item_id,),
        ).fetchone()
        if row is None:
            return jsonify({"success": False, "error": "History item not found"}), 404
        connection.execute("DELETE FROM detections WHERE id = ?", (item_id,))
    _delete_evidence_file(row["image_filename"])
    return jsonify({"success": True})


@app.delete("/api/history")
def clear_detection_history():
    with database_lock, _database_connection() as connection:
        rows = connection.execute("SELECT image_filename FROM detections").fetchall()
        connection.execute("DELETE FROM detections")
    for row in rows:
        _delete_evidence_file(row["image_filename"])
    return jsonify({"success": True})


@app.post("/api/notifications/test")
def test_server_notification():
    channels = _configured_notification_channels()
    if not channels:
        return jsonify(
            {
                "success": False,
                "error": "No server notification channel is configured",
                "notifications": _notification_status(),
            }
        ), 503

    now = datetime.now(timezone.utc).isoformat()
    test_item = {
        "id": "test",
        "created_at": now,
        "source": "notification-test",
        "hazard_detected": True,
        "detection_count": 1,
        "top_confidence": 99.0,
        "average_confidence": 99.0,
        "inference_ms": 0,
        "processing_ms": 0,
        "labels": {"fire": 1},
        "image_url": "/",
    }
    results = _send_server_notifications(test_item)
    success = any(result["success"] for result in results)
    return jsonify(
        {
            "success": success,
            "results": results,
            "notifications": _notification_status(),
        }
    ), 200 if success else 502


@app.get("/api/health")
def health():
    return jsonify(
        {
            "status": "ok" if session is not None else "degraded",
            "model_loaded": session is not None,
            "model": MODEL_PATH.name,
            "notifications": _notification_status(),
        }
    )


@app.get("/api/info")
def info():
    return jsonify(
        {
            "name": "EmberWatch Fire Detection API",
            "version": "3.0.0",
            "description": "Fire and smoke detection using ONNX Runtime",
            "confidence_threshold": CONFIDENCE_THRESHOLD,
            "inference_size": INFERENCE_SIZE,
            "model_input_shape": input_shape,
            "model_warmup": MODEL_WARMUP,
            "notifications": _notification_status(),
            "endpoints": {
                "/api/detect": "POST multipart/form-data or JSON base64 image",
                "/api/history": "GET or DELETE detection history",
                "/api/health": "GET service and model health",
                "/api/info": "GET API configuration",
                "/api/notifications/test": "POST test server-side notifications",
            },
        }
    )


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"success": False, "error": "The upload exceeds the server size limit"}), 413


@app.after_request
def set_response_headers(response):
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"

    if SECURITY_HEADERS_ENABLED:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(self), microphone=(), geolocation=(), payment=()",
        )
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            os.getenv(
                "CONTENT_SECURITY_POLICY",
                "default-src 'self'; "
                "base-uri 'self'; "
                "object-src 'none'; "
                "frame-ancestors 'none'; "
                "img-src 'self' data: blob:; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "connect-src 'self' https://*.supabase.co wss://*.supabase.co; "
                "media-src 'self' blob:; "
                "form-action 'self'",
            ),
        )
        if request.is_secure:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
    return response


@app.get("/")
def serve_frontend():
    if not (FRONTEND_DIST / "index.html").exists():
        return jsonify(
            {
                "success": False,
                "error": "Frontend build not found. Run `npm run build` in the frontend directory.",
            }
        ), 503
    return send_from_directory(FRONTEND_DIST, "index.html")


@app.get("/<path:path>")
def serve_frontend_asset(path: str):
    if path.startswith("api/"):
        return jsonify({"success": False, "error": "API endpoint not found"}), 404

    safe_path = safe_join(str(FRONTEND_DIST), path)
    if safe_path and Path(safe_path).is_file():
        return send_from_directory(FRONTEND_DIST, path)
    if (FRONTEND_DIST / "index.html").exists():
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({"success": False, "error": "Frontend build not found"}), 503


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    host = os.getenv("HOST", "127.0.0.1")
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host=host, port=port, threaded=True)
