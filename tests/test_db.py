import pytest
import asyncio
from backend.db import init_db, save_session, load_session, list_sessions, delete_session

@pytest.mark.asyncio
async def test_session_lifecycle():
    # Initialize DB (creates sqlite schema in memory/db file)
    await init_db()
    
    session_id = "test-session-uuid-123"
    session_name = "Chemistry Notes"
    
    # Mock canvas objects (strokes, shapes)
    mock_objects = [
      {
        "id": "stroke-1",
        "type": "stroke",
        "points": [{"x": 10, "y": 20}, {"x": 30, "y": 40}],
        "color": "#ffffff",
        "width": 5,
        "opacity": 1.0
      },
      {
        "id": "shape-1",
        "type": "shape",
        "shapeType": "circle",
        "x": 100,
        "y": 150,
        "width": 50,
        "height": 50,
        "color": "#ff0000",
        "strokeWidth": 3
      }
    ]

    # Test Save Session
    save_res = await save_session(session_id, session_name, mock_objects)
    assert save_res["id"] == session_id
    assert save_res["name"] == session_name

    # Test List Sessions
    sessions = await list_sessions()
    assert len(sessions) > 0
    assert any(s["id"] == session_id for s in sessions)

    # Test Load Session
    loaded = await load_session(session_id)
    assert loaded is not None
    assert loaded["name"] == session_name
    assert len(loaded["objects"]) == 2
    assert loaded["objects"][0]["id"] == "stroke-1"
    assert loaded["objects"][1]["type"] == "shape"
    assert loaded["objects"][1]["shapeType"] == "circle"

    # Test Delete Session
    deleted = await delete_session(session_id)
    assert deleted is True

    # Confirm it is removed
    loaded_after = await load_session(session_id)
    assert loaded_after is None
