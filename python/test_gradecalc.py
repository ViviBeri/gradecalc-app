"""Unit tests for the Python mirror of calc.js."""
import unittest

from gradecalc import (
    calculate_cgpa,
    calculate_sgpa,
    calculate_weighted_sgpa,
    convert_gpa_to_percentage,
    convert_percentage_to_gpa,
    marks_to_grade,
    points_to_grade_letter,
)


class GradeBoundaryTests(unittest.TestCase):
    def test_grade_boundaries(self):
        cases = [
            (None, "Ab", 0), ("", "Ab", 0), (-1, "Ab", 0), (101, "Ab", 0),
            (0, "F", 0), (39.99, "F", 0), (40, "P", 4), (49.99, "P", 4),
            (50, "C", 5), (55.99, "C", 5), (56, "B", 6), (60.99, "B", 6),
            (61, "B+", 7), (65.99, "B+", 7), (66, "A", 8), (70.99, "A", 8),
            (71, "A+", 9), (79.99, "A+", 9), (80, "O", 10), (100, "O", 10),
        ]
        for marks, label, point in cases:
            with self.subTest(marks=marks):
                result = marks_to_grade(marks)
                self.assertEqual(result["label"], label)
                self.assertEqual(result["point"], point)

    def test_non_numeric_marks_are_absent(self):
        self.assertEqual(marks_to_grade("not a mark")["label"], "Ab")

    def test_points_to_grade_letter(self):
        self.assertEqual(points_to_grade_letter(9.5), "O (10)")
        self.assertEqual(points_to_grade_letter(8.5), "A+ (9)")
        self.assertEqual(points_to_grade_letter(3.5), "P (4)")
        self.assertEqual(points_to_grade_letter(3.49), "F (0) — Needs improvement")


class CalculationTests(unittest.TestCase):
    def test_weighted_sgpa(self):
        result = calculate_weighted_sgpa([
            {"credits": 3, "gradePoint": 10},
            {"credits": 4, "gradePoint": 8},
            {"credits": 0, "gradePoint": 10},
        ])
        self.assertEqual(result["totalCredits"], 7)
        self.assertEqual(result["totalPoints"], 62)
        self.assertAlmostEqual(result["sgpa"], 62 / 7)

    def test_invalid_grade_points_count_as_zero(self):
        result = calculate_weighted_sgpa([
            {"credits": 2, "gradePoint": 12},
            {"credits": 2, "gradePoint": "invalid"},
        ])
        self.assertEqual(result["totalPoints"], 0)
        self.assertEqual(result["sgpa"], 0)

    def test_no_valid_credits(self):
        result = calculate_weighted_sgpa([{"credits": 0, "gradePoint": 10}])
        self.assertIsNone(result["sgpa"])

    def test_calculate_sgpa_from_subject_marks(self):
        result = calculate_sgpa([
            {"name": "Subject A", "credits": 3, "marks": 80},
            {"name": "Subject B", "credits": 4, "marks": 71},
            {"name": "No credit", "credits": 0, "marks": 100},
        ])
        self.assertEqual(result["totalCredits"], 7)
        self.assertEqual(result["totalPoints"], 66)
        self.assertAlmostEqual(result["sgpa"], 66 / 7)
        self.assertEqual(len(result["validSubjects"]), 2)

    def test_empty_subjects(self):
        self.assertIsNone(calculate_sgpa([]))

    def test_cgpa_is_arithmetic_mean_of_valid_semesters(self):
        result = calculate_cgpa([
            {"sgpa": "8.25"},
            {"sgpa": "7.5"},
            {"sgpa": ""},
            {"sgpa": "9.1"},
        ])
        self.assertEqual(len(result["validSemesters"]), 3)
        self.assertAlmostEqual(result["cgpa"], (8.25 + 7.5 + 9.1) / 3)

    def test_invalid_cgpa_entries_are_ignored(self):
        self.assertIsNone(calculate_cgpa([
            {"sgpa": 11}, {"sgpa": -1}, {"sgpa": "not-a-number"}, {"sgpa": ""}
        ]))

    def test_percentage_formulas_round_trip(self):
        expected = {
            "anna": 76,
            "vtu": 72.5,
            "jntuh_ktu_nit": 80,
            "mumbai": 67.8,
        }
        for formula, percentage in expected.items():
            with self.subTest(formula=formula):
                self.assertAlmostEqual(convert_gpa_to_percentage(8, formula), percentage)
                self.assertAlmostEqual(convert_percentage_to_gpa(percentage, formula), 8)

    def test_unknown_formula_defaults_to_anna(self):
        self.assertEqual(convert_gpa_to_percentage(8, "unknown"), 76)


if __name__ == "__main__":
    unittest.main()
