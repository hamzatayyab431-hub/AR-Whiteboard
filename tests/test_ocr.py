import pytest
from backend.ocr import parse_and_solve_math

def test_arithmetic_solving():
    # Test simple addition
    res = parse_and_solve_math("2 + 2")
    assert res["success"] is True
    assert float(res["result"]) == 4.0
    assert "4" in res["latex"]

    # Test multiplication & operator precedence
    res = parse_and_solve_math("3 * 5 + 2")
    assert res["success"] is True
    assert float(res["result"]) == 17.0
    assert "17" in res["result"]

def test_algebraic_solving():
    # Test single variable linear equation solving
    res = parse_and_solve_math("x - 10 = 5")
    assert res["success"] is True
    assert "15" in res["result"]

    # Test simple fractions or products
    res = parse_and_solve_math("2*x = 8")
    assert res["success"] is True
    assert "4" in res["result"]

def test_invalid_math_handling():
    # Test handling of non-mathematical strings (should fail gracefully)
    res = parse_and_solve_math("hello world")
    assert res["success"] is False
    assert res["result"] is None
    assert "hello" in res["latex"]
