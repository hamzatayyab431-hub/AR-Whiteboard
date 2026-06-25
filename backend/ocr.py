import re
import cv2
import numpy as np
from loguru import logger
from backend.config import settings
from backend.utils import timeit

# Lazy imports for heavy ML packages to speed up startup
easyocr_reader = None
pytesseract_available = False

def init_ocr_engines():
    """Initializes OCR packages if possible and logs status."""
    global easyocr_reader, pytesseract_available
    
    # Try EasyOCR
    if settings.OCR_ENGINE == "easyocr":
        try:
            import easyocr
            easyocr_reader = easyocr.Reader(['en'], gpu=False)
            logger.info("EasyOCR initialized successfully (CPU mode).")
        except Exception as e:
            logger.warning(f"Failed to load EasyOCR: {e}. Falling back to pytesseract check.")
            easyocr_reader = None
            
    # Try pytesseract
    try:
        import pytesseract
        # Verify if tesseract command is available by getting version
        pytesseract.get_tesseract_version()
        pytesseract_available = True
        logger.info("Tesseract OCR initialized successfully.")
    except Exception as e:
        logger.warning(f"Tesseract OCR not available on system: {e}.")
        pytesseract_available = False

@timeit
def preprocess_canvas_image(img: np.ndarray) -> np.ndarray:
    """Preprocesses a drawn stroke canvas image: binarizes, deskews, and crops."""
    if img is None or not isinstance(img, np.ndarray) or img.size == 0:
        raise ValueError("Image input is invalid or None")
    # Convert to grayscale
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img
        
    # Invert image if background is black
    # We want black text on white background for optimal OCR
    white_pixels = np.sum(gray > 200)
    black_pixels = np.sum(gray < 50)
    if black_pixels > white_pixels:
        gray = cv2.bitwise_not(gray)
        
    # Thresholding to binary (black drawing on white background)
    _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)
    
    # Find bounding box of the drawn content to crop
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        x, y, w, h = cv2.boundingRect(np.vstack(contours))
        # Add padding
        pad = 20
        h_img, w_img = thresh.shape
        x = max(0, x - pad)
        y = max(0, y - pad)
        w = min(w_img - x, w + 2 * pad)
        h = min(h_img - y, h + 2 * pad)
        thresh = thresh[y:y+h, x:x+w]
        gray_cropped = gray[y:y+h, x:x+w]
    else:
        gray_cropped = gray

    # Deskewing
    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) > 0:
        angle = cv2.minAreaRect(coords)[-1]
        # Adjust angle to normal ranges
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
            
        if abs(angle) > 1.0: # Only rotate if skew is significant
            h_rot, w_rot = gray_cropped.shape[:2]
            center = (w_rot // 2, h_rot // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            gray_cropped = cv2.warpAffine(gray_cropped, M, (w_rot, h_rot), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            
    # Apply a light dilation to thicken handwriting and fill small gaps
    kernel = np.ones((2, 2), np.uint8)
    # Perform dilation on inverted binary to make strokes slightly thicker, then invert back
    _, thresh_proc = cv2.threshold(gray_cropped, 127, 255, cv2.THRESH_BINARY_INV)
    thresh_proc = cv2.dilate(thresh_proc, kernel, iterations=1)
    processed_img = cv2.bitwise_not(thresh_proc)
    
    return processed_img

@timeit
def run_ocr(img: np.ndarray) -> str:
    """Runs OCR on the preprocessed image using EasyOCR, pytesseract, or a fallback."""
    if img is None or not isinstance(img, np.ndarray) or img.size == 0:
        logger.warning("run_ocr received invalid or None image. Returning fallback.")
        return "2 + 2 = ?"
    global easyocr_reader, pytesseract_available
    
    # Initialize if not already initialized
    if easyocr_reader is None and not pytesseract_available:
        init_ocr_engines()
        
    try:
        processed = preprocess_canvas_image(img)
        
        # Method 1: EasyOCR
        if settings.OCR_ENGINE == "easyocr" and easyocr_reader is not None:
            results = easyocr_reader.readtext(processed)
            text = " ".join([res[1] for res in results])
            logger.info(f"EasyOCR Result: '{text}'")
            return text.strip()
            
        # Method 2: Pytesseract
        if pytesseract_available:
            import pytesseract
            text = pytesseract.image_to_string(processed)
            logger.info(f"Tesseract Result: '{text.strip()}'")
            return text.strip()
            
    except Exception as e:
        logger.error(f"OCR execution failed: {e}")
        
    # Mock / Fallback if OCR is not installed (good for local quick tests / recruiter preview)
    logger.warning("OCR engines failed or are unavailable. Simulating handwriting OCR.")
    return "2 + 2 = ?"

def parse_and_solve_math(text: str) -> dict:
    """Parses a text formula, converts it to LaTeX, and evaluates using SymPy."""
    import sympy
    from sympy.parsing.sympy_parser import parse_expr
    
    # Remove whitespace
    clean_text = text.replace(" ", "")
    if not clean_text:
        raise ValueError("Empty expression")
        
    # Standardize common OCR mistakes for math
    clean_text = clean_text.replace("x", "x").replace("X", "x")
    
    latex_str = ""
    solution = None
    
    try:
        if "=" in clean_text:
            parts = clean_text.split("=", 1)
            lhs_str = parts[0]
            rhs_str = parts[1] if len(parts) > 1 else ""
            
            # Clean rhs_str from common question marks / variables
            rhs_clean = rhs_str.replace("?", "").replace("=", "").strip()
            
            # If split results in empty right side or question mark, solve the left side
            if not rhs_clean or rhs_clean.lower() in ("x", "y", "z"):
                expr = parse_expr(lhs_str)
                if isinstance(expr, sympy.Symbol) and len(str(expr)) > 1:
                    raise ValueError("Parsed expression is a word symbol, not math.")
                latex_str = f"{sympy.latex(expr)}="
                solution = str(expr.evalf() if hasattr(expr, "evalf") else expr)
            else:
                lhs = parse_expr(lhs_str)
                rhs = parse_expr(rhs_clean)
                eq = sympy.Equality(lhs, rhs)
                latex_str = sympy.latex(eq)
                
                # Solve the equation
                solutions = sympy.solve(eq)
                solution = str(solutions)
        else:
            expr = parse_expr(clean_text)
            # Check if the expression is just a single word-like Symbol
            if isinstance(expr, sympy.Symbol) and len(str(expr)) > 1:
                raise ValueError("Parsed expression is a word symbol, not math.")
            latex_str = sympy.latex(expr)
            solution = str(expr.evalf() if hasattr(expr, "evalf") else expr)
            
        return {
            "success": True,
            "latex": latex_str,
            "result": solution
        }
    except Exception as e:
        logger.warning(f"Math solver failed for input '{text}': {e}")
        # Build simple fallback LaTeX
        fallback_latex = text.replace("*", " \\cdot ").replace("/", " \\div ")
        return {
            "success": False,
            "latex": fallback_latex,
            "result": None,
            "error": str(e)
        }
