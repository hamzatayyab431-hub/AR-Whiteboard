import os
import pytest
import asyncio
from pathlib import Path

# Set test environment variables BEFORE importing backend components
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///test_whiteboard.db"

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    # Allow tests to run
    yield
    
    # Teardown the DB engine and delete the test database file
    from backend.db import engine
    
    # Run async engine disposal in a synchronous pytest fixture teardown
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    if loop.is_running():
        # If there's an active loop, schedule it
        async def dispose_engine():
            await engine.dispose()
        loop.create_task(dispose_engine())
    else:
        loop.run_until_complete(engine.dispose())
        
    db_file = Path("test_whiteboard.db")
    if db_file.exists():
        try:
            db_file.unlink()
        except Exception as e:
            print(f"Error deleting test db file: {e}")
