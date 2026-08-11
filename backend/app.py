import os
import time
from collections import defaultdict
import psutil
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, Response, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from loguru import logger

from backend.config import settings
from backend.db import init_db, list_sessions, load_session, save_session, delete_session
from backend.ocr import run_ocr, parse_and_solve_math, init_ocr_engines
from backend.export import export_to_image, export_to_svg, export_to_pdf
from backend.utils import base64_to_cv2

APP_VERSION = "1.2.0"
_startup_time: float = 0.0

# Simple in-memory rate limiter: tracks request timestamps per client IP
_rate_limit_store: Dict[str, list] = defaultdict(list)
RATE_LIMIT_MAX_REQUESTS = 100  # max requests per window
RATE_LIMIT_WINDOW_SECONDS = 60  # sliding window duration

# Schema definitions with input validation
class SaveRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=36, description="UUID of the session")
    name: str = Field(..., min_length=1, max_length=100, description="Human-readable session name")
    objects: List[Dict[str, Any]] = Field(default_factory=list, max_length=10000, description="Canvas objects (max 10,000)")

class ExportRequest(BaseModel):
    objects: List[Dict[str, Any]] = Field(default_factory=list, max_length=10000)
    format: str = Field(..., pattern=r"^(png|jpeg|jpg|svg|pdf)$", description="Export format")
    width: Optional[int] = Field(default=1920, ge=1, le=7680, description="Canvas width (max 8K)")
    height: Optional[int] = Field(default=1080, ge=1, le=4320, description="Canvas height (max 8K)")
    background_theme: Optional[str] = Field(default="dark", pattern=r"^(dark|light)$", description="Canvas background theme (dark or light)")

class OCRRequest(BaseModel):
    image: str = Field(..., max_length=10_485_760, description="Base64 encoded image (max ~10MB)")

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
    version=APP_VERSION,
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
async def rate_limit_middleware(request: Request, call_next):
    """Simple sliding-window rate limiter per client IP."""
    # Skip rate limiting for health/status checks
    if request.url.path in ("/health", "/status"):
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW_SECONDS

    # Prune old timestamps and append current
    _rate_limit_store[client_ip] = [
        ts for ts in _rate_limit_store[client_ip] if ts > window_start
    ]

    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        logger.warning(f"Rate limit exceeded for {client_ip}")
        return Response(
            content='{"detail":"Rate limit exceeded. Try again later."}',
            status_code=429,
            media_type="application/json",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)}
        )

    _rate_limit_store[client_ip].append(now)
    return await call_next(request)

@app.middleware("http")
async def log_request_timing(request: Request, call_next):
    """Middleware that logs every request with its processing duration."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({duration_ms:.1f}ms)")
    response.headers["X-Process-Time-Ms"] = f"{duration_ms:.1f}"
    return response

@app.get("/health")
async def health_check():
    """Lightweight liveness probe for container orchestrators (Docker, K8s)."""
    return {"status": "ok"}

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
async def get_all_sessions(
    query: Optional[str] = Query(None, description="Search session name"),
    limit: int = Query(50, ge=1, le=200, description="Max items to return"),
    offset: int = Query(0, ge=0, description="Pagination offset")
):
    """Endpoint to retrieve a list of saved whiteboard sessions with pagination and search."""
    try:
        sessions = await list_sessions(query=query, limit=limit, offset=offset)
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
            mime_type = "image/jpeg" if fmt in ("jpeg", "jpg") else "image/png"
            img_bytes = export_to_image(payload.objects, format=img_format, width=payload.width, height=payload.height)
            return Response(
                content=img_bytes,
                media_type=mime_type,
                headers={"Content-Disposition": f"attachment; filename=whiteboard.{fmt}"}
            )
            
        elif fmt == "pdf":
            pdf_bytes = export_to_pdf(payload.objects, width=payload.width, height=payload.height)
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

