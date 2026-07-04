import pytest
from backend.export import export_to_svg, export_to_image, export_to_pdf, _sanitize_svg_text


class TestSVGExport:
    """Tests for the SVG export pipeline."""

    def test_empty_canvas_produces_valid_svg(self):
        """An empty object list should still return a valid SVG wrapper."""
        svg = export_to_svg([], 800, 600)
        assert svg.startswith("<svg")
        assert "</svg>" in svg
        assert 'viewBox="0 0 800 600"' in svg

    def test_stroke_export(self):
        """A single stroke should produce an SVG path element."""
        objects = [
            {
                "type": "stroke",
                "points": [{"x": 10, "y": 20}, {"x": 30, "y": 40}, {"x": 50, "y": 60}],
                "color": "#ff0000",
                "width": 5,
                "opacity": 0.8,
            }
        ]
        svg = export_to_svg(objects)
        assert "<path" in svg
        assert 'stroke="#ff0000"' in svg
        assert 'stroke-width="5"' in svg

    def test_shape_rect_export(self):
        """A rectangle shape should produce an SVG rect element."""
        objects = [
            {
                "type": "shape",
                "shapeType": "rect",
                "x": 100,
                "y": 200,
                "width": 300,
                "height": 150,
                "color": "#00ff00",
                "strokeWidth": 2,
            }
        ]
        svg = export_to_svg(objects)
        assert "<rect" in svg
        assert 'x="100"' in svg

    def test_shape_circle_export(self):
        """A circle shape should produce an SVG circle element."""
        objects = [
            {
                "type": "shape",
                "shapeType": "circle",
                "x": 0,
                "y": 0,
                "width": 100,
                "height": 100,
                "color": "#0000ff",
                "strokeWidth": 3,
            }
        ]
        svg = export_to_svg(objects)
        assert "<circle" in svg

    def test_text_export_sanitizes_xss(self):
        """Text with HTML/script tags must be escaped in SVG output."""
        objects = [
            {
                "type": "text",
                "x": 10,
                "y": 10,
                "content": '<script>alert("xss")</script>',
                "color": "#ffffff",
                "fontSize": 16,
            }
        ]
        svg = export_to_svg(objects)
        # The raw script tag must NOT appear in output
        assert "<script>" not in svg
        # Escaped version should appear
        assert "&lt;script&gt;" in svg

    def test_arrow_shape_produces_marker(self):
        """An arrow shape should include an SVG marker definition."""
        objects = [
            {
                "type": "shape",
                "shapeType": "arrow",
                "x": 0,
                "y": 0,
                "width": 200,
                "height": 100,
                "color": "#ffffff",
                "strokeWidth": 2,
            }
        ]
        svg = export_to_svg(objects)
        assert "<marker" in svg
        assert "marker-end" in svg

    def test_single_point_stroke_skipped(self):
        """A stroke with fewer than 2 points should be silently skipped."""
        objects = [
            {
                "type": "stroke",
                "points": [{"x": 10, "y": 20}],
                "color": "#ffffff",
                "width": 3,
            }
        ]
        svg = export_to_svg(objects)
        assert "<path" not in svg


class TestSanitizeSVGText:
    """Unit tests for the _sanitize_svg_text helper."""

    def test_plain_text_unchanged(self):
        assert _sanitize_svg_text("hello world") == "hello world"

    def test_angle_brackets_escaped(self):
        assert _sanitize_svg_text("<b>bold</b>") == "&lt;b&gt;bold&lt;/b&gt;"

    def test_ampersand_escaped(self):
        assert _sanitize_svg_text("a & b") == "a &amp; b"

    def test_quotes_escaped(self):
        result = _sanitize_svg_text('say "hello"')
        assert "&quot;" in result


class TestImageExport:
    """Tests for raster and PDF exports."""

    def test_png_export_produces_bytes(self):
        img_bytes = export_to_image([], format="PNG")
        assert isinstance(img_bytes, bytes)
        assert len(img_bytes) > 0
        # PNG magic bytes
        assert img_bytes[:4] == b"\x89PNG"

    def test_jpeg_export_produces_bytes(self):
        img_bytes = export_to_image([], format="JPEG")
        assert isinstance(img_bytes, bytes)
        assert len(img_bytes) > 0
        # JPEG magic bytes
        assert img_bytes[:2] == b"\xff\xd8"

    def test_pdf_export_produces_bytes(self):
        pdf_bytes = export_to_pdf([])
        assert isinstance(pdf_bytes, bytes)
        assert pdf_bytes[:5] == b"%PDF-"
