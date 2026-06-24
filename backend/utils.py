import sys
import base64
import time
import cv2
import numpy as np
from functools import wraps
from loguru import logger

# Configure Loguru logger
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level:7}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="INFO"
)
logger.add(
    "logs/ar_whiteboard.log",
    rotation="10 MB",
    retention="10 days",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level:7} | {name}:{function}:{line} - {message}",
    level="DEBUG"
)

def timeit(func):
    """Decorator to log function execution time."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        elapsed = (end_time - start_time) * 1000
        logger.debug(f"{func.__name__} executed in {elapsed:.2f} ms")
        return result
    return wrapper

def async_timeit(func):
    """Decorator to log async function execution time."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = await func(*args, **kwargs)
        end_time = time.perf_counter()
        elapsed = (end_time - start_time) * 1000
        logger.debug(f"{func.__name__} executed in {elapsed:.2f} ms")
        return result
    return wrapper

def base64_to_cv2(b64_string: str) -> np.ndarray:
    """Converts base64 encoded image string to OpenCV BGR image."""
    try:
        # Strip header if present (e.g. "data:image/jpeg;base64,...")
        if "," in b64_string:
            b64_string = b64_string.split(",")[1]
        
        decoded_data = base64.b64decode(b64_string)
        nparr = np.frombuffer(decoded_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        logger.error(f"Error decoding base64 image: {str(e)}")
        raise ValueError("Invalid image encoding") from e

def cv2_to_base64(img: np.ndarray, format: str = ".jpg") -> str:
    """Converts OpenCV BGR image to base64 encoded string."""
    try:
        _, buffer = cv2.imencode(format, img)
        b64_str = base64.b64encode(buffer).decode("utf-8")
        mime = "image/jpeg" if format == ".jpg" else "image/png"
        return f"data:{mime};base64,{b64_str}"
    except Exception as e:
        logger.error(f"Error encoding image to base64: {str(e)}")
        raise ValueError("Encoding error") from e
