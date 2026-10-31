"""Tests for the GradeCalc PDF report generator."""
import json
import tempfile
import unittest
from pathlib import Path

from report_generator import build_report


class PdfReportTests(unittest.TestCase):
    def sample_data(self):
        return {
            "institution": "Test College",
            "student_name": "Sample Student",
            "semester": "Semester 1",
            "subjects": [
                {"name": "Programming", "marks": 84, "credits": 4},
                {"name": "Mathematics", "marks": 73, "credits": 3},
            ],
        }

    def test_builds_valid_pdf(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "semester-report.pdf"
            result = build_report(self.sample_data(), output)
            self.assertEqual(result, output)
            content = output.read_bytes()
            self.assertTrue(content.startswith(b"%PDF-"))
            self.assertGreater(len(content), 1000)

    def test_creates_parent_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "nested" / "report.pdf"
            build_report(self.sample_data(), output)
            self.assertTrue(output.is_file())

    def test_rejects_missing_student_name(self):
        data = self.sample_data()
        data["student_name"] = ""
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaisesRegex(ValueError, "student_name"):
                build_report(data, Path(temp_dir) / "report.pdf")

    def test_rejects_empty_subjects(self):
        data = self.sample_data()
        data["subjects"] = []
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaisesRegex(ValueError, "subjects"):
                build_report(data, Path(temp_dir) / "report.pdf")


if __name__ == "__main__":
    unittest.main()
