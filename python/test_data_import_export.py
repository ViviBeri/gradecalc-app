"""Tests for CSV/XLSX import and calculated result export."""
import csv
import tempfile
import unittest
from pathlib import Path

from data_import_export import calculate_results, export_results, load_records


class DataImportExportTests(unittest.TestCase):
    def write_csv(self, path):
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=[
                "student_name", "register_number", "semester", "subject", "marks", "credits"
            ])
            writer.writeheader()
            writer.writerows([
                {"student_name": "A Student", "register_number": "A01", "semester": "Sem 1",
                 "subject": "Programming", "marks": "80", "credits": "4"},
                {"student_name": "A Student", "register_number": "A01", "semester": "Sem 1",
                 "subject": "Maths", "marks": "71", "credits": "3"},
                {"student_name": "B Student", "register_number": "B01", "semester": "Sem 1",
                 "subject": "Programming", "marks": "90", "credits": "4"},
            ])

    def test_csv_import_and_grouped_calculation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "input.csv"
            self.write_csv(source)
            records = load_records(source)
            self.assertEqual(len(records), 3)
            results = calculate_results(records)
            self.assertEqual(len(results), 3)
            self.assertAlmostEqual(results[0]["semester_sgpa"], (4 * 10 + 3 * 9) / 7)
            self.assertAlmostEqual(results[1]["semester_sgpa"], 10)

    def test_csv_export(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "input.csv"
            destination = Path(temp_dir) / "results.csv"
            self.write_csv(source)
            results = calculate_results(load_records(source))
            export_results(results, destination)
            with destination.open(newline="", encoding="utf-8-sig") as handle:
                exported = list(csv.DictReader(handle))
            self.assertEqual(len(exported), 3)
            self.assertIn("semester_sgpa", exported[0])

    def test_xlsx_import_and_export(self):
        try:
            from openpyxl import Workbook, load_workbook
        except ImportError:
            self.skipTest("openpyxl is not installed")
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "input.xlsx"
            destination = Path(temp_dir) / "results.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.append(["student_name", "semester", "subject", "marks", "credits"])
            sheet.append(["A Student", "Sem 1", "Programming", 80, 4])
            workbook.save(source)
            records = load_records(source)
            self.assertEqual(len(records), 1)
            export_results(calculate_results(records), destination)
            result_book = load_workbook(destination, data_only=True)
            self.assertEqual(result_book.active.max_row, 2)
            result_book.close()

    def test_rejects_invalid_credit(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "input.csv"
            source.write_text(
                "student_name,semester,subject,marks,credits\nA,Sem 1,Maths,80,0\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "credits must be greater than zero"):
                load_records(source)

    def test_rejects_missing_columns(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "input.csv"
            source.write_text("student_name,semester\nA,Sem 1\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "missing columns"):
                load_records(source)


if __name__ == "__main__":
    unittest.main()
