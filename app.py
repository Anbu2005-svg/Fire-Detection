import cv2
import numpy as np
import onnxruntime as ort
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = str(BASE_DIR / "best.onnx")
CONFIDENCE_THRESHOLD = 0.20
IOU_THRESHOLD = 0.45
INFERENCE_SIZE = 640  # default for the ONNX model

CLASS_NAMES = {0: "fire", 1: "smoke"}
CLASS_COLORS = {0: (0, 70, 255), 1: (255, 160, 50)}  # BGR format for OpenCV

print("Loading ONNX model from:", MODEL_PATH)
try:
    available_providers = ort.get_available_providers()
    providers = [
        provider
        for provider in ("CUDAExecutionProvider", "CPUExecutionProvider")
        if provider in available_providers
    ]
    session = ort.InferenceSession(MODEL_PATH, providers=providers)
    meta = session.get_inputs()[0]
    input_name = meta.name
    input_shape = tuple(meta.shape)
    if len(input_shape) == 4 and isinstance(input_shape[2], int):
        INFERENCE_SIZE = input_shape[2]
    print(f"Model loaded successfully. Expected input shape: {input_shape}")
except Exception as e:
    print(f"Failed to load ONNX model: {e}")
    exit(1)


def letterbox(img, new_shape):
    h, w = img.shape[:2]
    scale = min(new_shape / h, new_shape / w)
    new_h, new_w = int(round(h * scale)), int(round(w * scale))
    img_resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    
    dw = new_shape - new_w
    dh = new_shape - new_h
    top, left = dh // 2, dw // 2
    
    padded = np.full((new_shape, new_shape, 3), 114, dtype=np.uint8)
    padded[top:top + new_h, left:left + new_w] = img_resized
    return padded, scale, (top, left)


def preprocess(img_bgr, imgsz):
    # Convert BGR to RGB for inference
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    padded, scale, pad = letterbox(img_rgb, imgsz)
    blob = padded.astype(np.float32) / 255.0
    blob = blob.transpose(2, 0, 1)[np.newaxis]  # HWC -> 1CHW
    return blob, scale, pad


def postprocess(output, conf_threshold, iou_threshold, scale, pad, orig_h, orig_w):
    preds = output[0]
    if preds.shape[0] < preds.shape[1]:
        preds = preds.T

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

    x, y, w, h = boxes_xywh[:, 0], boxes_xywh[:, 1], boxes_xywh[:, 2], boxes_xywh[:, 3]
    x1 = x - w / 2
    y1 = y - h / 2
    x2 = x + w / 2
    y2 = y + h / 2
    boxes_xyxy = np.stack([x1, y1, x2, y2], axis=1)

    pad_top, pad_left = pad
    boxes_xyxy[:, [0, 2]] = (boxes_xyxy[:, [0, 2]] - pad_left) / scale
    boxes_xyxy[:, [1, 3]] = (boxes_xyxy[:, [1, 3]] - pad_top) / scale
    boxes_xyxy[:, [0, 2]] = np.clip(boxes_xyxy[:, [0, 2]], 0, orig_w)
    boxes_xyxy[:, [1, 3]] = np.clip(boxes_xyxy[:, [1, 3]], 0, orig_h)

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
        iou_threshold
    )

    results = []
    if len(indices) > 0:
        indices = indices.flatten()
        for i in indices:
            results.append({
                "box": boxes_xyxy[i].tolist(),
                "confidence": float(max_scores[i]),
                "class_id": int(class_ids[i]),
                "label": CLASS_NAMES.get(int(class_ids[i]), f"class_{class_ids[i]}")
            })
    return results


def run_live_video():
    print("Starting webcam...")
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    # Try to set higher resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("\n--- Live Video Processing Started ---")
    print("Press 'q' or 'ESC' in the video window to quit.\n")

    fps_times = []

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame.")
            break

        start_time = time.perf_counter()
        orig_h, orig_w = frame.shape[:2]

        blob, scale, pad = preprocess(frame, INFERENCE_SIZE)
        
        # Run inference
        outputs = session.run(None, {input_name: blob})
        
        # Postprocess and get boxes
        detections = postprocess(outputs[0], CONFIDENCE_THRESHOLD, IOU_THRESHOLD, scale, pad, orig_h, orig_w)
        
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        fps_times.append(1000 / elapsed_ms)
        if len(fps_times) > 30:
            fps_times.pop(0)
        avg_fps = sum(fps_times) / len(fps_times)

        # Draw detections directly on the BGR frame
        for det in detections:
            x1, y1, x2, y2 = [int(v) for v in det["box"]]
            color = CLASS_COLORS.get(det["class_id"], (0, 255, 0))
            
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            label = f'{det["label"]} {det["confidence"]:.0%}'
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
            cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
            cv2.putText(frame, label, (x1 + 2, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)

        # Draw FPS and Status
        cv2.putText(frame, f"FPS: {avg_fps:.1f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        if len(detections) > 0:
            cv2.putText(frame, f"ALERT: {len(detections)} detection(s)", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        cv2.imshow("EmberWatch - Live Video Processing", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q') or key == 27:  # 27 is ESC
            break

    cap.release()
    cv2.destroyAllWindows()
    print("Live video processing stopped.")

if __name__ == "__main__":
    run_live_video()
