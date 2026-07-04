# ==========================================
# Stage 1: Build Frontend (React + TS + Vite)
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy dependencies manifest
COPY frontend/package*.json ./
RUN npm ci --prefer-offline

# Copy source and build static assets
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Unified Python Backend
# ==========================================
FROM python:3.12-slim AS backend-runner

LABEL maintainer="AR Whiteboard Team"
LABEL description="AI-powered AR Whiteboard application"

WORKDIR /app

# Install system dependencies (OpenCV GL libraries and Tesseract OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download and bake EasyOCR models into the container image
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

# Copy backend codebase
COPY backend/ ./backend

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

# Expose server port
EXPOSE 8000

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=8000

# Container health check using the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Launch server
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
