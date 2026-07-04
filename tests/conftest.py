import os
import pytest
import asyncio
from pathlib import Path

# Set test environment variables BEFORE importing backend components
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///test_whiteboard.db"


@pytest.fixture(scope="session")
def event_loop():
    """Create a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Set up and tear down the test database."""
    yield

    # Teardown: dispose the async engine and delete the test database file
    from backend.db import engine

    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(engine.dispose())
        loop.close()
    except Exception as e:
        print(f"Warning: could not dispose engine: {e}")

    db_file = Path("test_whiteboard.db")
    if db_file.exists():
        try:
            db_file.unlink()
        except Exception as e:
            print(f"Warning: could not delete test db file: {e}")
