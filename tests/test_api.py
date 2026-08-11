import pytest
from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_status_endpoint():
    response = client.get("/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "cpu_usage_percent" in data
    assert "memory_usage_percent" in data
    assert "features" in data

def test_settings_endpoint():
    response = client.get("/settings")
    assert response.status_code == 200
    data = response.json()
    assert "ocr_engine" in data
    assert "feature_flags" in data

def test_export_svg_endpoint():
    payload = {
        "objects": [
            {
                "id": "stroke-1",
                "type": "stroke",
                "points": [{"x": 10, "y": 20}, {"x": 30, "y": 40}],
                "color": "#ffffff",
                "width": 3,
                "opacity": 1.0
            }
        ],
        "format": "svg",
        "width": 1920,
        "height": 1080
    }
    response = client.post("/export", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/svg+xml"
    assert b"<svg" in response.content
    assert b"stroke-width=\"3\"" in response.content

def test_export_png_endpoint():
    payload = {
        "objects": [],
        "format": "png",
        "width": 800,
        "height": 600
    }
    response = client.post("/export", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert len(response.content) > 0

def test_invalid_export_format():
    payload = {
        "objects": [],
        "format": "exe"
    }
    response = client.post("/export", json=payload)
    assert response.status_code == 422  # Pydantic validation rejects invalid format

def test_health_endpoint():
    """The /health liveness probe should always return 200 with status ok."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_session_not_found():
    """Requesting a non-existent session should return 404."""
    response = client.get("/sessions/non-existent-uuid-000")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

def test_delete_session_not_found():
    """Deleting a non-existent session should return 404."""
    response = client.delete("/sessions/non-existent-uuid-999")
    assert response.status_code == 404

def test_batch_delete_sessions_endpoint():
    """Batch deletion endpoint should accept a list of session IDs and delete them."""
    # First save two sessions
    client.post("/save", json={"session_id": "b-del-1", "name": "S1", "objects": []})
    client.post("/save", json={"session_id": "b-del-2", "name": "S2", "objects": []})

    response = client.post("/sessions/batch-delete", json={"session_ids": ["b-del-1", "b-del-2"]})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["deleted_count"] == 2

def test_export_pdf_endpoint():
    """PDF export should return application/pdf content type."""
    payload = {
        "objects": [],
        "format": "pdf",
        "width": 800,
        "height": 600
    }
    response = client.post("/export", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:5] == b"%PDF-"

def test_export_jpeg_endpoint():
    """JPEG export should return image/jpeg content type."""
    payload = {
        "objects": [],
        "format": "jpeg",
        "width": 400,
        "height": 300
    }
    response = client.post("/export", json=payload)
    assert response.status_code == 200
    assert "image/jpeg" in response.headers["content-type"]
