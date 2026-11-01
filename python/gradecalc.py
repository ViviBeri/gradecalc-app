"""Python mirror of GradeCalc's browser calculation rules.

This module is for development tools, batch processing, and independent
verification. The browser PWA continues to use calc.js at runtime.
"""
from __future__ import annotations

from math import isfinite
from typing import Any, Iterable, Mapping


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, str) and not value.strip():
        return None
    try:
        result = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result if isfinite(result) else None


def marks_to_grade(value: Any) -> dict[str, Any]:
    """Convert marks in the inclusive 0–100 scale to grade label and points."""
    marks = _number(value)
    if marks is None or marks < 0 or marks > 100:
        return {"label": "Ab", "point": 0, "cls": "absent"}
    if marks >= 80:
        return {"label": "O", "point": 10, "cls": "pass"}
    if marks >= 71:
        return {"label": "A+", "point": 9, "cls": "pass"}
    if marks >= 66:
        return {"label": "A", "point": 8, "cls": "pass"}
    if marks >= 61:
        return {"label": "B+", "point": 7, "cls": "pass"}
    if marks >= 56:
        return {"label": "B", "point": 6, "cls": "pass"}
    if marks >= 50:
        return {"label": "C", "point": 5, "cls": "pass"}
    if marks >= 40:
        return {"label": "P", "point": 4, "cls": "pass"}
    return {"label": "F", "point": 0, "cls": "fail"}


def points_to_grade_letter(points: Any) -> str:
    value = _number(points)
    if value is None:
        value = 0
    if value >= 9.5:
        return "O (10)"
    if value >= 8.5:
        return "A+ (9)"
    if value >= 7.5:
        return "A (8)"
    if value >= 6.5:
        return "B+ (7)"
    if value >= 5.5:
        return "B (6)"
    if value >= 4.5:
        return "C (5)"
    if value >= 3.5:
        return "P (4)"
    return "F (0) — Needs improvement"


def calculate_weighted_sgpa(rows: Iterable[Mapping[str, Any]] | None) -> dict[str, float | None]:
    total_credits = 0.0
    total_points = 0.0
    for row in rows or []:
        credits = _number(row.get("credits"))
        points = _number(row.get("gradePoint", row.get("points")))
        if credits is None or credits <= 0:
            continue
        if points is None or points < 0 or points > 10:
            points = 0.0
        total_credits += credits
        total_points += credits * points
    return {
        "totalCredits": total_credits,
        "totalPoints": total_points,
        "sgpa": total_points / total_credits if total_credits > 0 else None,
    }


def calculate_sgpa(subjects: Iterable[Mapping[str, Any]] | None) -> dict[str, Any] | None:
    valid_subjects = []
    for subject in subjects or []:
        credits_value = subject.get("credits")
        credits = _number(credits_value)
        if credits_value is None or isinstance(credits_value, str) and not credits_value.strip():
            continue
        if credits is None or credits <= 0:
            continue
        grade = marks_to_grade(subject.get("marks"))
        valid_subjects.append({
            **subject,
            "gradePoint": grade["point"],
            "gradeLabel": grade["label"],
            "gradeClass": grade["cls"],
            "numericCredits": credits,
        })
    if not valid_subjects:
        return None
    result = calculate_weighted_sgpa([
        {"credits": subject["numericCredits"], "gradePoint": subject["gradePoint"]}
        for subject in valid_subjects
    ])
    return {
        "validSubjects": valid_subjects,
        "totalCredits": result["totalCredits"],
        "totalPoints": result["totalPoints"],
        "sgpa": result["sgpa"],
    }


def calculate_cgpa(semesters: Iterable[Mapping[str, Any]] | None) -> dict[str, Any] | None:
    valid_semesters = []
    for index, semester in enumerate(semesters or []):
        if not semester:
            continue
        raw_sgpa = semester.get("sgpa")
        if raw_sgpa is None or isinstance(raw_sgpa, str) and not raw_sgpa.strip():
            continue
        value = _number(raw_sgpa)
        if value is None or value < 0 or value > 10:
            continue
        valid_semesters.append({
            "sgpa": raw_sgpa,
            "label": semester.get("label") or f"Semester {index + 1}",
            "numericSGPA": value,
        })
    if not valid_semesters:
        return None
    total = sum(item["numericSGPA"] for item in valid_semesters)
    return {
        "validSemesters": valid_semesters,
        "sum": total,
        "cgpa": total / len(valid_semesters),
    }


_PERCENTAGE_FORMULAS = {
    "anna": (9.5, 0.0),
    "vtu": (10.0, -7.5),
    "jntuh_ktu_nit": (10.0, 0.0),
    "mumbai": (7.1, 11.0),
}


def convert_gpa_to_percentage(gpa: Any, formula: str = "anna") -> float:
    value = _number(gpa)
    if value is None:
        raise ValueError("GPA must be a finite number")
    multiplier, offset = _PERCENTAGE_FORMULAS.get(formula, _PERCENTAGE_FORMULAS["anna"])
    return value * multiplier + offset


def convert_percentage_to_gpa(percentage: Any, formula: str = "anna") -> float:
    value = _number(percentage)
    if value is None:
        raise ValueError("Percentage must be a finite number")
    multiplier, offset = _PERCENTAGE_FORMULAS.get(formula, _PERCENTAGE_FORMULAS["anna"])
    return (value - offset) / multiplier
