import json
import io
import math
from typing import List, Dict, Any
from PIL import Image, ImageDraw, ImageFont
from loguru import logger

def export_to_svg(objects: List[Dict[str, Any]], width: int = 1920, height: int = 1080) -> str:
    """Exports canvas objects to a vector SVG string."""
    svg_elements = []
    svg_elements.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" height="100%" style="background-color: #121212;">')
    
    # Grid lines overlay (optional, matches frontend layout)
    svg_elements.append('<defs>')
    svg_elements.append('  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">')
    svg_elements.append('    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2a2a2a" stroke-width="1"/>')
    svg_elements.append('  </pattern>')
    svg_elements.append('</defs>')
    svg_elements.append('<rect width="100%" height="100%" fill="url(#grid)" />')

    for obj in objects:
        obj_type = obj.get("type")
        color = obj.get("color", "#ffffff")
        
        if obj_type == "stroke":
            points = obj.get("points", [])
            if len(points) < 2:
                continue
            stroke_width = obj.get("width", 3)
            opacity = obj.get("opacity", 1.0)
            
            # Build SVG path
            path_d = f"M {points[0]['x']} {points[0]['y']}"
            for p in points[1:]:
                path_d += f" L {p['x']} {p['y']}"
                
            svg_elements.append(
                f'<path d="{path_d}" fill="none" stroke="{color}" stroke-width="{stroke_width}" stroke-opacity="{opacity}" stroke-linecap="round" stroke-linejoin="round" />'
            )
            
        elif obj_type == "shape":
            shape_type = obj.get("shapeType")
            x = obj.get("x", 0)
            y = obj.get("y", 0)
            w = obj.get("width", 100)
            h = obj.get("height", 100)
            stroke_width = obj.get("strokeWidth", 3)
            
            if shape_type == "rect":
                svg_elements.append(
                    f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="{color}" stroke-width="{stroke_width}" rx="4" />'
                )
            elif shape_type == "circle":
                r = max(w, h) / 2
                cx = x + w / 2
                cy = y + h / 2
                svg_elements.append(
                    f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="{stroke_width}" />'
                )
            elif shape_type == "triangle":
                p1 = f"{x + w/2},{y}"
                p2 = f"{x},{y + h}"
                p3 = f"{x + w},{y + h}"
                svg_elements.append(
                    f'<polygon points="{p1} {p2} {p3}" fill="none" stroke="{color}" stroke-width="{stroke_width}" />'
                )
            elif shape_type == "line":
                svg_elements.append(
                    f'<line x1="{x}" y1="{y}" x2="{x + w}" y2="{y + h}" stroke="{color}" stroke-width="{stroke_width}" stroke-linecap="round" />'
                )
            elif shape_type == "arrow":
                # Render line and arrowhead
                x1, y1 = x, y
                x2, y2 = x + w, y + h
                arrow_id = f"arrow-{x}-{y}"
                # Define arrowhead marker
                svg_elements.append(
                    f'<defs><marker id="{arrow_id}" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="{color}"/></marker></defs>'
                )
                svg_elements.append(
                    f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{stroke_width}" marker-end="url(#{arrow_id})" />'
                )
                
        elif obj_type == "text":
            x = obj.get("x", 0)
            y = obj.get("y", 0)
            content = obj.get("content", "")
            font_size = obj.get("fontSize", 20)
            
            # Simple text alignment
            svg_elements.append(
                f'<text x="{x}" y="{y}" fill="{color}" font-family="system-ui, sans-serif" font-size="{font_size}" dominant-baseline="hanging">{content}</text>'
            )

    svg_elements.append("</svg>")
    return "\n".join(svg_elements)

def render_to_pil(objects: List[Dict[str, Any]], width: int = 1920, height: int = 1080) -> Image.Image:
    """Renders the list of objects onto a Pillow Image (dark background)."""
    # Create image with dark slate background
    img = Image.new("RGBA", (width, height), (18, 18, 18, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw simple grid pattern
    grid_spacing = 40
    for x in range(0, width, grid_spacing):
        draw.line([(x, 0), (x, height)], fill=(42, 42, 42, 255), width=1)
    for y in range(0, height, grid_spacing):
        draw.line([(0, y), (width, y)], fill=(42, 42, 42, 255), width=1)

    for obj in objects:
        obj_type = obj.get("type")
        color_hex = obj.get("color", "#ffffff").lstrip('#')
        
        # Convert hex color to RGBA tuple
        if len(color_hex) == 6:
            r, g, b = int(color_hex[0:2], 16), int(color_hex[2:4], 16), int(color_hex[4:6], 16)
        else:
            r, g, b = 255, 255, 255
            
        opacity = int(obj.get("opacity", 1.0) * 255)
        color = (r, g, b, opacity)

        if obj_type == "stroke":
            points = obj.get("points", [])
            if len(points) < 2:
                continue
            stroke_width = int(obj.get("width", 3))
            
            # Convert list of points to tuple pairs
            coords = [(p["x"], p["y"]) for p in points]
            # Draw line segments with rounded joins
            for i in range(len(coords) - 1):
                draw.line([coords[i], coords[i+1]], fill=color, width=stroke_width, joint="round")
                
        elif obj_type == "shape":
            shape_type = obj.get("shapeType")
            x = obj.get("x", 0)
            y = obj.get("y", 0)
            w = obj.get("width", 100)
            h = obj.get("height", 100)
            stroke_width = int(obj.get("strokeWidth", 3))
            
            if shape_type == "rect":
                draw.rectangle([x, y, x + w, y + h], outline=color, width=stroke_width)
            elif shape_type == "circle":
                r_val = max(w, h) / 2
                cx = x + w / 2
                cy = y + h / 2
                draw.ellipse([cx - r_val, cy - r_val, cx + r_val, cy + r_val], outline=color, width=stroke_width)
            elif shape_type == "triangle":
                pts = [(x + w/2, y), (x, y + h), (x + w, y + h)]
                draw.polygon(pts, outline=color, width=stroke_width)
            elif shape_type == "line":
                draw.line([(x, y), (x + w, y + h)], fill=color, width=stroke_width)
            elif shape_type == "arrow":
                x1, y1 = x, y
                x2, y2 = x + w, y + h
                # Main line
                draw.line([(x1, y1), (x2, y2)], fill=color, width=stroke_width)
                # Arrowhead simple calculation
                angle = math.atan2(y2 - y1, x2 - x1)
                arrow_len = 15
                arrow_angle = math.pi / 6 # 30 degrees
                
                ap1_x = x2 - arrow_len * math.cos(angle - arrow_angle)
                ap1_y = y2 - arrow_len * math.sin(angle - arrow_angle)
                ap2_x = x2 - arrow_len * math.cos(angle + arrow_angle)
                ap2_y = y2 - arrow_len * math.sin(angle + arrow_angle)
                
                draw.polygon([(x2, y2), (ap1_x, ap1_y), (ap2_x, ap2_y)], fill=color)

        elif obj_type == "text":
            x = obj.get("x", 0)
            y = obj.get("y", 0)
            content = obj.get("content", "")
            font_size = int(obj.get("fontSize", 20))
            
            try:
                # Attempt to load a scalable default font at the requested size
                font = ImageFont.load_default(size=font_size)
            except (TypeError, Exception):
                # Older Pillow versions don't support size param; fall back
                font = ImageFont.load_default()
                
            draw.text((x, y), content, fill=color, font=font)

    return img

def export_to_image(objects: List[Dict[str, Any]], format: str = "PNG") -> bytes:
    """Renders objects and exports to a PNG/JPEG bytes stream."""
    img = render_to_pil(objects)
    output = io.BytesIO()
    
    # JPEG does not support alpha channel transparency
    if format.upper() in ("JPEG", "JPG"):
        img = img.convert("RGB")
        img.save(output, format="JPEG", quality=95)
    else:
        img.save(output, format="PNG")
        
    return output.getvalue()

def export_to_pdf(objects: List[Dict[str, Any]]) -> bytes:
    """Renders objects to PDF pages and returns as bytes."""
    # Convert PNG image to PDF
    img = render_to_pil(objects)
    img_rgb = img.convert("RGB")
    
    output = io.BytesIO()
    img_rgb.save(output, format="PDF", resolution=100.0)
    return output.getvalue()
