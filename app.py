import gradio as gr
from ultralytics import YOLO
import os

# Load model (assumes 'best.pt' is in same directory)
model_path = "best.pt"
model = YOLO(model_path)

def detect_objects(image):
    results = model.predict(image)
    annotated_frame = results[0].plot()  # Draw boxes
    return annotated_frame

# Launch Gradio app
gr.Interface(
    fn=detect_objects,
    inputs=gr.Image(type="pil"),
    outputs=gr.Image(type="numpy"),
    title="🔥 Fire and Smoke Detection with YOLOv8",
    description="Upload an image and the model will detect fire/smoke if present."
).launch()
