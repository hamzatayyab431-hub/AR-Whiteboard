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
    assert response.status_code == 400
