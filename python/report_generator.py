"""Generate a printable GradeCalc semester report as a PDF.

Input is a JSON file containing student/course details and subject marks/credits.
The calculations use the same grade rules as the browser calculator.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

try:
    from .gradecalc import calculate_sgpa
except ImportError:
    from gradecalc import calculate_sgpa


def build_report(data: dict[str, Any], output_path: str | Path) -> Path:
    """Create a semester PDF report and return its destination path.

    Required JSON fields:
      student_name, semester, subjects
    Optional fields:
      register_number, programme, institution, academic_year
    Each subject requires name, credits, and marks.
    """
    student_name = str(data.get("student_name", "")).strip()
    semester = str(data.get("semester", "")).strip()
    subjects = data.get("subjects")

    if not student_name:
        raise ValueError("student_name is required")
    if not semester:
        raise ValueError("semester is required")
    if not isinstance(subjects, list) or not subjects:
        raise ValueError("subjects must be a non-empty list")

    normalized_subjects = []
    for index, subject in enumerate(subjects, start=1):
        if not isinstance(subject, dict):
            raise ValueError(f"subject {index} must be an object")
        name = str(subject.get("name", "")).strip()
        if not name:
            raise ValueError(f"subject {index} is missing its name")
        if "credits" not in subject:
            raise ValueError(f"{name}: credits are required")
        if "marks" not in subject:
            raise ValueError(f"{name}: marks are required")
        normalized_subjects.append({
            "name": name,
            "credits": subject["credits"],
            "marks": subject["marks"],
        })

    result = calculate_sgpa(normalized_subjects)
    if result is None:
        raise ValueError("at least one subject must have valid positive credits")

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ReportTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=19,
        leading=23,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#17365D"),
        spaceAfter=5 * mm,
    ))
    styles.add(ParagraphStyle(
        name="SmallMuted",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#555555"),
    ))

    def safe(value: Any) -> str:
        from xml.sax.saxutils import escape
        return escape(str(value if value is not None else "—"))

    story = [
        Paragraph("GradeCalc — Semester Report", styles["ReportTitle"]),
        Paragraph(safe(data.get("institution") or "Academic Performance Summary"), styles["Heading2"]),
        Spacer(1, 4 * mm),
    ]

    details = [
        ["Student", safe(student_name), "Semester", safe(semester)],
        ["Register number", safe(data.get("register_number")), "Programme", safe(data.get("programme"))],
        ["Academic year", safe(data.get("academic_year")), "Total credits", f'{result["totalCredits"]:g}'],
    ]
    detail_table = Table(details, colWidths=[31 * mm, 57 * mm, 31 * mm, 57 * mm])
    detail_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EAF0F7")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#EAF0F7")),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#17365D")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C8D1DC")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([detail_table, Spacer(1, 8 * mm)])

    story.append(Paragraph("Subject-wise result", styles["Heading2"]))
    rows = [["Subject", "Marks", "Grade", "Grade point", "Credits", "Credit points"]]
    for subject in result["validSubjects"]:
        rows.append([
            Paragraph(safe(subject["name"]), styles["BodyText"]),
            safe(subject.get("marks")),
            subject["gradeLabel"],
            f'{subject["gradePoint"]:g}',
            f'{subject["numericCredits"]:g}',
            f'{subject["numericCredits"] * subject["gradePoint"]:g}',
        ])
    rows.append([
        "TOTAL", "", "", "", f'{result["totalCredits"]:g}', f'{result["totalPoints"]:g}'
    ])

    subject_table = Table(
        rows,
        repeatRows=1,
        colWidths=[66 * mm, 20 * mm, 20 * mm, 23 * mm, 20 * mm, 27 * mm],
    )
    subject_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17365D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EAF0F7")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C8D1DC")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([subject_table, Spacer(1, 9 * mm)])

    summary = [
        ["SGPA", f'{result["sgpa"]:.2f} / 10'],
        ["Total credits", f'{result["totalCredits"]:g}'],
        ["Total credit points", f'{result["totalPoints"]:g}'],
    ]
    summary_table = Table(summary, colWidths=[55 * mm, 45 * mm], hAlign="LEFT")
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EAF0F7")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#AAB8C8")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([
        summary_table,
        Spacer(1, 8 * mm),
        Paragraph(
            "Calculation note: SGPA = sum of (credit × grade point) divided by total valid credits. "
            "Grade boundaries follow the GradeCalc SGC scale. This report is generated from "
            "the data supplied and is not an official transcript.",
            styles["SmallMuted"],
        ),
    ])

    def add_page_number(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(18 * mm, 12 * mm, "GradeCalc • Student-generated report")
        canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, f"Page {document.page}")
        canvas.restoreState()

    document = SimpleDocTemplate(
        str(destination),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=20 * mm,
        title=f"GradeCalc Semester Report — {student_name}",
        author="GradeCalc",
    )
    document.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a GradeCalc semester PDF report from JSON.")
    parser.add_argument("input_json", help="Path to the semester data JSON file")
    parser.add_argument("output_pdf", help="Destination PDF path")
    args = parser.parse_args()

    with Path(args.input_json).open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    output = build_report(data, args.output_pdf)
    print(f"PDF report created: {output}")


if __name__ == "__main__":
    main()
