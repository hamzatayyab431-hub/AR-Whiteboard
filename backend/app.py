import os
import sys
import time
import psutil
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from loguru import logger

from backend.config import settings
from backend.db import init_db, list_sessions, load_session, save_session, delete_session
from backend.ocr import run_ocr, parse_and_solve_math, init_ocr_engines
from backend.export import export_to_image, export_to_svg, export_to_pdf
from backend.utils import base64_to_cv2

APP_VERSION = "1.1.0"
_startup_time: float = 0.0

# Schema definitions
class SaveRequest(BaseModel):
    session_id: str
    name: str
    objects: List[Dict[str, Any]]

class ExportRequest(BaseModel):
    objects: List[Dict[str, Any]]
    format: str  # "png", "jpeg", "svg", "pdf"
    width: Optional[int] = 1920
    height: Optional[int] = 1080

class OCRRequest(BaseModel):
    image: str  # Base64 encoded screenshot of the drawing mask

# Lifespan manager for FastAPI
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _startup_time
    # Startup actions
    _startup_time = time.time()
    logger.info("Starting up FastAPI Whiteboard Backend...")
    try:
        await init_db()
        logger.info("SQLite Database initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing SQLite Database: {e}")
    
    # Initialize OCR engines in background thread/task
    init_ocr_engines()
    yield
    # Shutdown actions
    logger.info("Shutting down Whiteboard Backend...")

app = FastAPI(
    title="AR Whiteboard Backend",
    description="Production-grade AI-powered AR Whiteboard API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_request_timing(request: Request, call_next):
    """Middleware that logs every request with its processing duration."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({duration_ms:.1f}ms)")
    response.headers["X-Process-Time-Ms"] = f"{duration_ms:.1f}"
    return response

@app.get("/status")
async def get_status():
    """Gets backend system status, resource metrics, version, and uptime."""
    try:
        cpu_usage = psutil.cpu_percent(interval=None)
        memory = psutil.virtual_memory()
        memory_usage = memory.percent
    except Exception:
        # Fallback if psutil is not fully supported or throws error
        cpu_usage = 10.0
        memory_usage = 25.0

    uptime_seconds = int(time.time() - _startup_time) if _startup_time else 0

    try:
        sessions = await list_sessions()
        session_count = len(sessions)
    except Exception:
        session_count = -1

    return {
        "status": "online",
        "version": APP_VERSION,
        "uptime_seconds": uptime_seconds,
        "session_count": session_count,
        "cpu_usage_percent": cpu_usage,
        "memory_usage_percent": memory_usage,
        "features": {
            "ai_shapes": settings.FEATURE_AI_SHAPES,
            "equation_solver": settings.FEATURE_EQUATION_SOLVER,
            "collaborative_mode": settings.FEATURE_COLLABORATIVE_MODE,
        },
        "ocr_engine": settings.OCR_ENGINE
    }

@app.get("/settings")
def get_settings():
    """Returns application configuration settings."""
    return {
        "ocr_engine": settings.OCR_ENGINE,
        "math_solver_enabled": settings.MATH_SOLVER_ENABLED,
        "spell_correct_enabled": settings.SPELL_CORRECT_ENABLED,
        "default_color": "#ffffff",
        "feature_flags": {
            "ai_shapes": settings.FEATURE_AI_SHAPES,
            "equation_solver": settings.FEATURE_EQUATION_SOLVER,
        }
    }

@app.get("/sessions")
async def get_all_sessions():
    """Endpoint to retrieve a list of all saved whiteboard sessions."""
    try:
        sessions = await list_sessions()
        return sessions
    except Exception as e:
        logger.error(f"Failed to list sessions: {e}")
        raise HTTPException(status_code=500, detail="Database retrieval failed")

@app.get("/sessions/{session_id}")
async def get_session_by_id(session_id: str):
    """Endpoint to load a specific whiteboard session by its unique UUID."""
    try:
        session_data = await load_session(session_id)
        if not session_data:
            raise HTTPException(status_code=404, detail="Session not found")
        return session_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to load session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Database load failed")

@app.post("/save")
async def save_whiteboard_session(payload: SaveRequest):
    """Endpoint to save or update canvas elements under a whiteboard session."""
    try:
        result = await save_session(
            session_id=payload.session_id,
            name=payload.name,
            objects=payload.objects
        )
        return {"status": "success", "session": result}
    except Exception as e:
        logger.error(f"Failed to save session: {e}")
        raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")

@app.delete("/sessions/{session_id}")
async def remove_session(session_id: str):
    """Endpoint to delete a whiteboard session from the database."""
    try:
        deleted = await delete_session(session_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"status": "success", "message": f"Session {session_id} deleted."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Database deletion failed")

@app.post("/ocr")
def process_ocr(payload: OCRRequest):
    """Runs handwriting recognition on canvas image. Evaluates math if applicable."""
    try:
        # Convert base64 text image mask to OpenCV image
        cv2_img = base64_to_cv2(payload.image)
        if cv2_img is None:
            raise HTTPException(status_code=400, detail="Invalid image encoding or empty buffer")
        recognized_text = run_ocr(cv2_img)
        
        result = {
            "text": recognized_text,
            "math": None
        }
        
        # If math solver is enabled and string looks like math, solve it
        if settings.MATH_SOLVER_ENABLED and recognized_text:
            # Look for arithmetic characters (+, -, *, /, =, or variables) including common OCR unicode symbols
            math_chars = set("0123456789+-*/=xyz^(). ×÷²³XY")
            is_likely_math = len(recognized_text) > 0 and all(c in math_chars for c in recognized_text)
            
            if is_likely_math:
                math_result = parse_and_solve_math(recognized_text)
                result["math"] = math_result
                
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR Request processing failed: {e}")
        raise HTTPException(status_code=400, detail=f"OCR execution failed: {str(e)}")

@app.post("/export")
def export_canvas(payload: ExportRequest):
    """Generates and returns canvas file exports (PNG, JPEG, SVG, PDF)."""
    fmt = payload.format.lower()
    
    try:
        if fmt == "svg":
            svg_content = export_to_svg(payload.objects, payload.width, payload.height)
            return Response(
                content=svg_content,
                media_type="image/svg+xml",
                headers={"Content-Disposition": "attachment; filename=whiteboard.svg"}
            )
            
        elif fmt in ("png", "jpeg", "jpg"):
            img_format = "JPEG" if fmt in ("jpeg", "jpg") else "PNG"
            mime_type = f"image/{fmt}"
            img_bytes = export_to_image(payload.objects, format=img_format)
            return Response(
                content=img_bytes,
                media_type=mime_type,
                headers={"Content-Disposition": f"attachment; filename=whiteboard.{fmt}"}
            )
            
        elif fmt == "pdf":
            pdf_bytes = export_to_pdf(payload.objects)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=whiteboard.pdf"}
            )
            
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported format '{payload.format}'")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export generation failed: {str(e)}")

# Mount production frontend static files if directory exists
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    logger.info(f"Mounted production static frontend from {frontend_dist}")

