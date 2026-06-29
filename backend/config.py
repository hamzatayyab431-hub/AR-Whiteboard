import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = ["*"]
    
    # Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    DATABASE_URL: str = "sqlite+aiosqlite:///ar_whiteboard.db"
    
    # OCR & AI
    OCR_ENGINE: str = "easyocr"  # "easyocr" or "pytesseract"
    MATH_SOLVER_ENABLED: bool = True
    SPELL_CORRECT_ENABLED: bool = True
    
    # Feature Flags
    FEATURE_AI_SHAPES: bool = True
    FEATURE_EQUATION_SOLVER: bool = True
    FEATURE_COLLABORATIVE_MODE: bool = False
    
    # Camera / Processing (Defaults if backend captures video)
    DEFAULT_RESOLUTION_WIDTH: int = 1280
    DEFAULT_RESOLUTION_HEIGHT: int = 720
    FPS_LIMIT: int = 30

# Ensure data directory exists
settings = Settings()
os.makedirs(settings.DATA_DIR, exist_ok=True)
