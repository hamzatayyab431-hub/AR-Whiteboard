import json
from datetime import datetime, timezone
import uuid
from typing import List, Dict, Any, Optional
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text, Index, select, delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from backend.config import settings

Base = declarative_base()

class WhiteboardSession(Base):
    __tablename__ = "sessions"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class CanvasObject(Base):
    __tablename__ = "canvas_objects"
    
    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(20), nullable=False)  # 'stroke', 'shape', 'text'
    data = Column(Text, nullable=False)        # JSON string containing coordinates, color, size, text etc.
    layer = Column(Integer, default=0)
    
    __table_args__ = (
        Index("ix_canvas_objects_session_id_layer", "session_id", "layer"),
    )

# Create engine and sessionmaker
engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def init_db():
    """Initializes the database schema."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def list_sessions() -> List[Dict[str, Any]]:
    """Lists all available sessions, ordered by updated_at desc."""
    async with async_session() as session:
        result = await session.execute(
            select(WhiteboardSession).order_by(WhiteboardSession.updated_at.desc())
        )
        sessions = result.scalars().all()
        return [
            {
                "id": s.id,
                "name": s.name,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat()
            } for s in sessions
        ]

async def load_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Loads a session's details and all of its canvas objects."""
    async with async_session() as session:
        # Load session metadata
        result = await session.execute(
            select(WhiteboardSession).where(WhiteboardSession.id == session_id)
        )
        s = result.scalar_one_or_none()
        if not s:
            return None
            
        # Load objects
        obj_result = await session.execute(
            select(CanvasObject)
            .where(CanvasObject.session_id == session_id)
            .order_by(CanvasObject.layer.asc())
        )
        objects = obj_result.scalars().all()
        
        parsed_objects = []
        for obj in objects:
            try:
                parsed_data = json.loads(obj.data)
                parsed_objects.append({
                    "id": obj.id,
                    "type": obj.type,
                    **parsed_data
                })
            except json.JSONDecodeError:
                continue
                
        return {
            "id": s.id,
            "name": s.name,
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
            "objects": parsed_objects
        }

async def save_session(session_id: str, name: str, objects: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Saves or updates a session and overwrites its canvas objects."""
    async with async_session() as session:
        async with session.begin():
            # Check if session exists
            result = await session.execute(
                select(WhiteboardSession).where(WhiteboardSession.id == session_id)
            )
            s = result.scalar_one_or_none()
            
            if s:
                s.name = name
                s.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            else:
                s = WhiteboardSession(id=session_id, name=name)
                session.add(s)
            
            # Delete old objects
            await session.execute(
                delete(CanvasObject).where(CanvasObject.session_id == session_id)
            )
            
            # Save new objects
            for idx, obj in enumerate(objects):
                obj_id = obj.get("id") or str(uuid.uuid4())
                # Exclude id and type from serialized data
                serialized_data = {k: v for k, v in obj.items() if k not in ("id", "type")}
                
                canvas_obj = CanvasObject(
                    id=obj_id,
                    session_id=session_id,
                    type=obj.get("type", "stroke"),
                    data=json.dumps(serialized_data),
                    layer=idx
                )
                session.add(canvas_obj)
                
            return {
                "id": s.id,
                "name": s.name,
                "updated_at": s.updated_at.isoformat()
            }

async def delete_session(session_id: str) -> bool:
    """Deletes a session and cascadingly deletes its canvas objects."""
    async with async_session() as session:
        async with session.begin():
            result = await session.execute(
                select(WhiteboardSession).where(WhiteboardSession.id == session_id)
            )
            s = result.scalar_one_or_none()
            if not s:
                return False
            await session.delete(s)
            return True
