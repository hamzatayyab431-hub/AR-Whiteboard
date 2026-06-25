# ==========================================
# Stage 1: Build Frontend (React + TS + Vite)
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy dependencies manifest
COPY frontend/package*.json ./
RUN npm install

# Copy source and build static assets
COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Unified Python Backend
# ==========================================
FROM python:3.12-slim AS backend-runner
WORKDIR /app

# Install system dependencies (OpenCV GL libraries and Tesseract OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1-mesa-glx \
    libglib2.0-0 \
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

# Expose server port
EXPOSE 8000

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=8000

# Launch server
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
