from app_flask import app  # Re-export the Flask app for platforms that expect app.py

# This file simply re-exports the `app` object defined in app_flask.py so
# deployment platforms (like Vercel) that look for a top-level `app` variable
# can find it.
