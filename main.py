"""
Root main.py proxy to backend.main:app.
Allows starting the server either from the repository root:
    uvicorn main:app --reload
or from the backend directory:
    cd backend && uvicorn main:app --reload
"""
import sys
from pathlib import Path

# Add backend directory to sys.path so backend imports resolve seamlessly
BACKEND_DIR = Path(__file__).resolve().parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from backend.main import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)