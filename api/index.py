"""
Vercel Serverless Function entrypoint for RehabOpt AR.
This exposes the Flask WSGI application instance for Vercel edge/serverless routing.
"""
import sys
import os

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import app

# Vercel searches for 'app' in the entrypoint file
if __name__ == "__main__":
    app.run()
