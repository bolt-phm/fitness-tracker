from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import date, datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


ROOT_DIR = Path(__file__).resolve().parent
STATIC_DIR = ROOT_DIR
DB_PATH = ROOT_DIR / "fitness_tracker.db"
MEAL_TYPES = ("breakfast", "lunch", "dinner")
MEAL_LABELS = {
    "breakfast": "早餐",
    "lunch": "午餐",
    "dinner": "晚餐",
}
TRACKER_VERSION = "FITNESS_TRACKER_V1"
TRACKER_BEGIN = f"{TRACKER_VERSION}_BEGIN"
TRACKER_END = f"{TRACKER_VERSION}_END"

DEFAULT_PROFILE = {
    "heightM": 1.71,
    "startWeight": 84.0,
    "targetWeight": 64.0,
    "goalDays": 60,
    "startDate": date.today().isoformat(),
    "notes": "健身房减脂计划，优先记录体重、饮食与训练数据。",
}

DEFAULT_EXERCISE_TYPES = [
    {
        "name": "慢走",
        "description": "适合作为热身或恢复训练。",
        "fields": [
            {"label": "坡度", "unit": "%", "fieldType": "number", "required": False, "defaultValue": "6"},
            {"label": "速度", "unit": "km/h", "fieldType": "number", "required": False, "defaultValue": "5"},
        ],
    },
    {
        "name": "跑步机快走",
        "description": "中等强度有氧，适合稳定控心率。",
        "fields": [
            {"label": "坡度", "unit": "%", "fieldType": "number", "required": False, "defaultValue": "10"},
            {"label": "速度", "unit": "km/h", "fieldType": "number", "required": False, "defaultValue": "6"},
        ],
    },
    {
        "name": "椭圆机",
        "description": "保护膝盖的有氧选项。",
        "fields": [
            {"label": "阻力", "unit": "档", "fieldType": "number", "required": False, "defaultValue": "8"},
            {"label": "平均步频", "unit": "spm", "fieldType": "number", "required": False, "defaultValue": "120"},
        ],
    },
    {
        "name": "动感单车",
        "description": "高效燃脂，适合做间歇训练。",
        "fields": [
            {"label": "阻力", "unit": "档", "fieldType": "number", "required": False, "defaultValue": "6"},
            {"label": "平均踏频", "unit": "rpm", "fieldType": "number", "required": False, "defaultValue": "80"},
        ],
    },
    {
        "name": "力量训练",
        "description": "建议保留，用于减脂期维持肌肉量。",
        "fields": [
            {"label": "总组数", "unit": "组", "fieldType": "number", "required": False, "defaultValue": "12"},
            {"label": "平均次数", "unit": "次", "fieldType": "number", "required": False, "defaultValue": "10"},
            {"label": "平均重量", "unit": "kg", "fieldType": "number", "required": False, "defaultValue": "20"},
        ],
    },
]


def current_timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def parse_iso_date(value: str) -> str:
    date.fromisoformat(value)
    return value


def as_float(value: Any) -> float | None:
    if value in ("", None):
        return None
    return round(float(value), 2)


def as_int(value: Any) -> int | None:
    if value in ("", None):
        return None
    return int(float(value))


def as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def slugify_field_key(label: str) -> str:
    label = label.strip().lower()
    label = re.sub(r"[^\w]+", "_", label, flags=re.UNICODE)
    label = re.sub(r"_+", "_", label).strip("_")
    if label:
        return label
    fallback = "_".join(f"{ord(char):x}" for char in label.strip())
    return f"field_{fallback}" if fallback else f"field_{datetime.now().strftime('%H%M%S')}"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                height_m REAL NOT NULL,
                start_weight REAL NOT NULL,
                target_weight REAL,
                goal_days INTEGER,
                start_date TEXT NOT NULL,
                notes TEXT DEFAULT '',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS daily_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_date TEXT NOT NULL UNIQUE,
                weight_kg REAL,
                intake_calories INTEGER,
                extra_burn_calories INTEGER,
                step_count INTEGER,
                sleep_hours REAL,
                hydration_ml INTEGER,
                note TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS meals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                daily_record_id INTEGER NOT NULL REFERENCES daily_records(id) ON DELETE CASCADE,
                meal_type TEXT NOT NULL,
                plan_text TEXT DEFAULT '',
                actual_text TEXT DEFAULT '',
                calories INTEGER,
                UNIQUE(daily_record_id, meal_type)
            );

            CREATE TABLE IF NOT EXISTS exercise_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS exercise_type_fields (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exercise_type_id INTEGER NOT NULL REFERENCES exercise_types(id) ON DELETE CASCADE,
                field_key TEXT NOT NULL,
                label TEXT NOT NULL,
                unit TEXT DEFAULT '',
                field_type TEXT NOT NULL DEFAULT 'number',
                required INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                default_value TEXT DEFAULT '',
                UNIQUE(exercise_type_id, field_key)
            );

            CREATE TABLE IF NOT EXISTS exercise_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                daily_record_id INTEGER NOT NULL REFERENCES daily_records(id) ON DELETE CASCADE,
                exercise_type_id INTEGER NOT NULL REFERENCES exercise_types(id) ON DELETE RESTRICT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                duration_minutes REAL,
                calories_burned REAL,
                intensity TEXT DEFAULT '',
                note TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS exercise_entry_values (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exercise_entry_id INTEGER NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
                field_key TEXT NOT NULL,
                label TEXT NOT NULL,
                unit TEXT DEFAULT '',
                value_text TEXT NOT NULL
            );
            """
        )

        if conn.execute("SELECT 1 FROM profile WHERE id = 1").fetchone() is None:
            conn.execute(
                """
                INSERT INTO profile (
                    id, height_m, start_weight, target_weight, goal_days, start_date, notes, updated_at
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    DEFAULT_PROFILE["heightM"],
                    DEFAULT_PROFILE["startWeight"],
                    DEFAULT_PROFILE["targetWeight"],
                    DEFAULT_PROFILE["goalDays"],
                    DEFAULT_PROFILE["startDate"],
                    DEFAULT_PROFILE["notes"],
                    current_timestamp(),
                ),
            )

        if conn.execute("SELECT COUNT(*) AS total FROM exercise_types").fetchone()["total"] == 0:
            for template in DEFAULT_EXERCISE_TYPES:
                insert_exercise_type(conn, template)


def latest_logged_weight(conn: sqlite3.Connection) -> float | None:
    row = conn.execute(
        """
        SELECT weight_kg
        FROM daily_records
        WHERE weight_kg IS NOT NULL
        ORDER BY record_date DESC
        LIMIT 1
        """
    ).fetchone()
    return as_float(row["weight_kg"]) if row else None


def build_goal_summary(profile: dict[str, Any], latest_weight: float | None) -> dict[str, Any]:
    start_weight = profile["startWeight"]
    current_weight = latest_weight if latest_weight is not None else start_weight
    target_weight = profile.get("targetWeight")
    goal_days = profile.get("goalDays")
    height_m = profile.get("heightM")
    warnings: list[str] = []
    bmi = None
    target_delta = None
    weekly_rate = None
    required_daily_deficit = None
    remaining_weight = None

    if height_m:
        bmi = round(current_weight / (height_m * height_m), 1)

    if target_weight is not None:
        target_delta = round(start_weight - target_weight, 2)
        remaining_weight = round(current_weight - target_weight, 2)

    if target_delta and goal_days:
        weekly_rate = round(target_delta / goal_days * 7, 2)
        required_daily_deficit = round(target_delta * 7700 / goal_days)

        if weekly_rate > 1.0:
            warnings.append(
                f"当前目标等于每周减重约 {weekly_rate} kg，明显高于常见的 0.5-1.0 kg/周减脂节奏。"
            )
        if required_daily_deficit > 1000:
            warnings.append(
                f"按当前目标估算需要约 {required_daily_deficit} kcal/天 的热量缺口，建议在医生或营养师指导下执行。"
            )

    return {
        "currentWeight": current_weight,
        "currentBmi": bmi,
        "targetDelta": target_delta,
        "weeklyRate": weekly_rate,
        "requiredDailyDeficit": required_daily_deficit,
        "remainingWeight": remaining_weight,
        "warnings": warnings,
    }


def serialize_profile(conn: sqlite3.Connection) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM profile WHERE id = 1").fetchone()
    latest_weight = latest_logged_weight(conn)
    profile = {
        "heightM": as_float(row["height_m"]),
        "startWeight": as_float(row["start_weight"]),
        "targetWeight": as_float(row["target_weight"]),
        "goalDays": row["goal_days"],
        "startDate": row["start_date"],
        "notes": row["notes"] or "",
    }
    profile["summary"] = build_goal_summary(profile, latest_weight)
    return profile


def empty_record(record_date: str) -> dict[str, Any]:
    return {
        "date": record_date,
        "weightKg": None,
        "intakeCalories": None,
        "extraBurnCalories": None,
        "stepCount": None,
        "sleepHours": None,
        "hydrationMl": None,
        "note": "",
        "meals": {
            meal_type: {"planText": "", "actualText": "", "calories": None}
            for meal_type in MEAL_TYPES
        },
        "exerciseEntries": [],
    }


def fetch_exercise_types(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    type_rows = conn.execute(
        "SELECT id, name, description FROM exercise_types ORDER BY created_at ASC, id ASC"
    ).fetchall()
    field_rows = conn.execute(
        """
        SELECT exercise_type_id, field_key, label, unit, field_type, required, default_value
        FROM exercise_type_fields
        ORDER BY sort_order ASC, id ASC
        """
    ).fetchall()
    fields_by_type: dict[int, list[dict[str, Any]]] = {}
    for row in field_rows:
        fields_by_type.setdefault(row["exercise_type_id"], []).append(
            {
                "fieldKey": row["field_key"],
                "label": row["label"],
                "unit": row["unit"] or "",
                "fieldType": row["field_type"],
                "required": bool(row["required"]),
                "defaultValue": row["default_value"] or "",
            }
        )

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"] or "",
            "fields": fields_by_type.get(row["id"], []),
        }
        for row in type_rows
    ]


def fetch_record(conn: sqlite3.Connection, record_date: str) -> dict[str, Any]:
    parse_iso_date(record_date)
    row = conn.execute(
        """
        SELECT *
        FROM daily_records
        WHERE record_date = ?
        """,
        (record_date,),
    ).fetchone()
    if row is None:
        return empty_record(record_date)

    record = {
        "date": row["record_date"],
        "weightKg": as_float(row["weight_kg"]),
        "intakeCalories": row["intake_calories"],
        "extraBurnCalories": row["extra_burn_calories"],
        "stepCount": row["step_count"],
        "sleepHours": as_float(row["sleep_hours"]),
        "hydrationMl": row["hydration_ml"],
        "note": row["note"] or "",
        "meals": empty_record(record_date)["meals"],
        "exerciseEntries": [],
    }

    meal_rows = conn.execute(
        """
        SELECT meal_type, plan_text, actual_text, calories
        FROM meals
        WHERE daily_record_id = ?
        """,
        (row["id"],),
    ).fetchall()
    for meal in meal_rows:
        record["meals"][meal["meal_type"]] = {
            "planText": meal["plan_text"] or "",
            "actualText": meal["actual_text"] or "",
            "calories": meal["calories"],
        }

    entry_rows = conn.execute(
        """
        SELECT ee.id, ee.exercise_type_id, ee.duration_minutes, ee.calories_burned, ee.intensity, ee.note,
               et.name AS exercise_type_name
        FROM exercise_entries ee
        JOIN exercise_types et ON et.id = ee.exercise_type_id
        WHERE ee.daily_record_id = ?
        ORDER BY ee.sort_order ASC, ee.id ASC
        """,
        (row["id"],),
    ).fetchall()
    for entry in entry_rows:
        value_rows = conn.execute(
            """
            SELECT field_key, label, unit, value_text
            FROM exercise_entry_values
            WHERE exercise_entry_id = ?
            ORDER BY id ASC
            """,
            (entry["id"],),
        ).fetchall()
        values = [
            {
                "fieldKey": value["field_key"],
                "label": value["label"],
                "unit": value["unit"] or "",
                "valueText": value["value_text"],
            }
            for value in value_rows
        ]
        record["exerciseEntries"].append(
            {
                "id": entry["id"],
                "exerciseTypeId": entry["exercise_type_id"],
                "exerciseTypeName": entry["exercise_type_name"],
                "durationMinutes": as_float(entry["duration_minutes"]),
                "caloriesBurned": as_float(entry["calories_burned"]),
                "intensity": entry["intensity"] or "",
                "note": entry["note"] or "",
                "values": values,
            }
        )

    return record


def insert_exercise_type(conn: sqlite3.Connection, payload: dict[str, Any]) -> int:
    name = as_text(payload.get("name"))
    if not name:
        raise ValueError("运动项目名称不能为空。")

    cursor = conn.execute(
        """
        INSERT INTO exercise_types (name, description, created_at)
        VALUES (?, ?, ?)
        """,
        (name, as_text(payload.get("description")), current_timestamp()),
    )
    exercise_type_id = cursor.lastrowid
    fields = payload.get("fields", [])
    for index, field in enumerate(fields):
        label = as_text(field.get("label"))
        if not label:
            continue
        conn.execute(
            """
            INSERT INTO exercise_type_fields (
                exercise_type_id, field_key, label, unit, field_type, required, sort_order, default_value
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exercise_type_id,
                slugify_field_key(as_text(field.get("fieldKey")) or label),
                label,
                as_text(field.get("unit")),
                as_text(field.get("fieldType")) or "number",
                1 if field.get("required") else 0,
                index,
                as_text(field.get("defaultValue")),
            ),
        )
    return exercise_type_id


def update_exercise_type(conn: sqlite3.Connection, exercise_type_id: int, payload: dict[str, Any]) -> None:
    name = as_text(payload.get("name"))
    if not name:
        raise ValueError("运动项目名称不能为空。")

    conn.execute(
        """
        UPDATE exercise_types
        SET name = ?, description = ?
        WHERE id = ?
        """,
        (name, as_text(payload.get("description")), exercise_type_id),
    )
    conn.execute("DELETE FROM exercise_type_fields WHERE exercise_type_id = ?", (exercise_type_id,))
    fields = payload.get("fields", [])
    for index, field in enumerate(fields):
        label = as_text(field.get("label"))
        if not label:
            continue
        conn.execute(
            """
            INSERT INTO exercise_type_fields (
                exercise_type_id, field_key, label, unit, field_type, required, sort_order, default_value
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exercise_type_id,
                slugify_field_key(as_text(field.get("fieldKey")) or label),
                label,
                as_text(field.get("unit")),
                as_text(field.get("fieldType")) or "number",
                1 if field.get("required") else 0,
                index,
                as_text(field.get("defaultValue")),
            ),
        )


def save_profile(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    height_m = as_float(payload.get("heightM"))
    start_weight = as_float(payload.get("startWeight"))
    target_weight = as_float(payload.get("targetWeight"))
    goal_days = as_int(payload.get("goalDays"))
    start_date = parse_iso_date(as_text(payload.get("startDate")) or date.today().isoformat())

    if not height_m or not start_weight:
        raise ValueError("身高和起始体重不能为空。")

    conn.execute(
        """
        INSERT INTO profile (id, height_m, start_weight, target_weight, goal_days, start_date, notes, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            height_m = excluded.height_m,
            start_weight = excluded.start_weight,
            target_weight = excluded.target_weight,
            goal_days = excluded.goal_days,
            start_date = excluded.start_date,
            notes = excluded.notes,
            updated_at = excluded.updated_at
        """,
        (
            height_m,
            start_weight,
            target_weight,
            goal_days,
            start_date,
            as_text(payload.get("notes")),
            current_timestamp(),
        ),
    )
    return serialize_profile(conn)


def save_record(conn: sqlite3.Connection, record_date: str, payload: dict[str, Any]) -> dict[str, Any]:
    parse_iso_date(record_date)
    now = current_timestamp()
    conn.execute(
        """
        INSERT INTO daily_records (
            record_date, weight_kg, intake_calories, extra_burn_calories, step_count,
            sleep_hours, hydration_ml, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(record_date) DO UPDATE SET
            weight_kg = excluded.weight_kg,
            intake_calories = excluded.intake_calories,
            extra_burn_calories = excluded.extra_burn_calories,
            step_count = excluded.step_count,
            sleep_hours = excluded.sleep_hours,
            hydration_ml = excluded.hydration_ml,
            note = excluded.note,
            updated_at = excluded.updated_at
        """,
        (
            record_date,
            as_float(payload.get("weightKg")),
            as_int(payload.get("intakeCalories")),
            as_int(payload.get("extraBurnCalories")),
            as_int(payload.get("stepCount")),
            as_float(payload.get("sleepHours")),
            as_int(payload.get("hydrationMl")),
            as_text(payload.get("note")),
            now,
            now,
        ),
    )
    record_id = conn.execute(
        "SELECT id FROM daily_records WHERE record_date = ?",
        (record_date,),
    ).fetchone()["id"]

    conn.execute("DELETE FROM meals WHERE daily_record_id = ?", (record_id,))
    conn.execute("DELETE FROM exercise_entries WHERE daily_record_id = ?", (record_id,))

    meals = payload.get("meals", {})
    for meal_type in MEAL_TYPES:
        meal = meals.get(meal_type, {})
        conn.execute(
            """
            INSERT INTO meals (daily_record_id, meal_type, plan_text, actual_text, calories)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                record_id,
                meal_type,
                as_text(meal.get("planText")),
                as_text(meal.get("actualText")),
                as_int(meal.get("calories")),
            ),
        )

    valid_type_ids = {row["id"] for row in conn.execute("SELECT id FROM exercise_types").fetchall()}
    entries = payload.get("exerciseEntries", [])
    for index, entry in enumerate(entries):
        exercise_type_id = as_int(entry.get("exerciseTypeId"))
        if exercise_type_id not in valid_type_ids:
            raise ValueError("存在未定义的运动项目，请刷新页面后重试。")

        cursor = conn.execute(
            """
            INSERT INTO exercise_entries (
                daily_record_id, exercise_type_id, sort_order, duration_minutes,
                calories_burned, intensity, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                exercise_type_id,
                index,
                as_float(entry.get("durationMinutes")),
                as_float(entry.get("caloriesBurned")),
                as_text(entry.get("intensity")),
                as_text(entry.get("note")),
            ),
        )
        entry_id = cursor.lastrowid
        for value in entry.get("values", []):
            label = as_text(value.get("label"))
            value_text = as_text(value.get("valueText"))
            if not label or not value_text:
                continue
            conn.execute(
                """
                INSERT INTO exercise_entry_values (exercise_entry_id, field_key, label, unit, value_text)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    entry_id,
                    slugify_field_key(as_text(value.get("fieldKey")) or label),
                    label,
                    as_text(value.get("unit")),
                    value_text,
                ),
            )

    return fetch_record(conn, record_date)


def delete_record(conn: sqlite3.Connection, record_date: str) -> None:
    parse_iso_date(record_date)
    conn.execute("DELETE FROM daily_records WHERE record_date = ?", (record_date,))


def fetch_stats(conn: sqlite3.Connection, start_date: str, end_date: str) -> dict[str, Any]:
    parse_iso_date(start_date)
    parse_iso_date(end_date)
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    series_rows = conn.execute(
        """
        SELECT dr.record_date,
               dr.weight_kg,
               dr.intake_calories,
               dr.extra_burn_calories,
               dr.step_count,
               dr.sleep_hours,
               dr.hydration_ml,
               dr.note,
               COALESCE(SUM(ee.duration_minutes), 0) AS exercise_minutes,
               COALESCE(SUM(ee.calories_burned), 0) AS exercise_calories,
               COUNT(ee.id) AS session_count
        FROM daily_records dr
        LEFT JOIN exercise_entries ee ON ee.daily_record_id = dr.id
        WHERE dr.record_date BETWEEN ? AND ?
        GROUP BY dr.id
        ORDER BY dr.record_date ASC
        """,
        (start_date, end_date),
    ).fetchall()

    series = []
    weights = []
    total_intake = 0
    total_extra_burn = 0
    total_exercise_minutes = 0.0
    total_exercise_calories = 0.0
    total_sessions = 0
    for row in series_rows:
        weight = as_float(row["weight_kg"])
        intake_calories = row["intake_calories"]
        extra_burn = row["extra_burn_calories"]
        exercise_minutes = as_float(row["exercise_minutes"]) or 0.0
        exercise_calories = as_float(row["exercise_calories"]) or 0.0
        session_count = row["session_count"] or 0
        net_calories = None
        if intake_calories is not None:
            net_calories = intake_calories - (extra_burn or 0) - round(exercise_calories)
        if weight is not None:
            weights.append(weight)
        total_intake += intake_calories or 0
        total_extra_burn += extra_burn or 0
        total_exercise_minutes += exercise_minutes
        total_exercise_calories += exercise_calories
        total_sessions += session_count
        series.append(
            {
                "date": row["record_date"],
                "weightKg": weight,
                "intakeCalories": intake_calories,
                "extraBurnCalories": extra_burn,
                "stepCount": row["step_count"],
                "sleepHours": as_float(row["sleep_hours"]),
                "hydrationMl": row["hydration_ml"],
                "note": row["note"] or "",
                "exerciseMinutes": exercise_minutes,
                "exerciseCalories": exercise_calories,
                "sessionCount": session_count,
                "netCalories": net_calories,
            }
        )

    breakdown_rows = conn.execute(
        """
        SELECT et.name,
               COUNT(ee.id) AS sessions,
               COALESCE(SUM(ee.duration_minutes), 0) AS total_minutes,
               COALESCE(SUM(ee.calories_burned), 0) AS total_calories
        FROM exercise_entries ee
        JOIN daily_records dr ON dr.id = ee.daily_record_id
        JOIN exercise_types et ON et.id = ee.exercise_type_id
        WHERE dr.record_date BETWEEN ? AND ?
        GROUP BY et.id
        ORDER BY total_minutes DESC, sessions DESC, et.name ASC
        """,
        (start_date, end_date),
    ).fetchall()

    summary = {
        "daysLogged": len(series),
        "averageWeight": round(sum(weights) / len(weights), 2) if weights else None,
        "weightChange": round(weights[-1] - weights[0], 2) if len(weights) >= 2 else None,
        "totalIntakeCalories": total_intake,
        "totalExtraBurnCalories": total_extra_burn,
        "totalExerciseMinutes": round(total_exercise_minutes, 1),
        "totalExerciseCalories": round(total_exercise_calories, 1),
        "totalSessions": total_sessions,
    }

    breakdown = [
        {
            "name": row["name"],
            "sessions": row["sessions"],
            "totalMinutes": as_float(row["total_minutes"]) or 0.0,
            "totalCalories": as_float(row["total_calories"]) or 0.0,
        }
        for row in breakdown_rows
    ]

    return {
        "startDate": start_date,
        "endDate": end_date,
        "summary": summary,
        "series": series,
        "exerciseBreakdown": breakdown,
    }


def coerce_record_payload(payload: dict[str, Any], fallback_date: str | None = None) -> dict[str, Any]:
    record_date = parse_iso_date(as_text(payload.get("date")) or fallback_date or date.today().isoformat())
    record = empty_record(record_date)
    record["weightKg"] = as_float(payload.get("weightKg", payload.get("weight")))
    record["intakeCalories"] = as_int(
        payload.get("intakeCalories", payload.get("caloriesIntake", payload.get("targetIntakeCalories")))
    )
    record["extraBurnCalories"] = as_int(
        payload.get("extraBurnCalories", payload.get("targetExtraBurnCalories"))
    )
    record["stepCount"] = as_int(payload.get("stepCount", payload.get("steps")))
    record["sleepHours"] = as_float(payload.get("sleepHours", payload.get("sleep")))
    record["hydrationMl"] = as_int(payload.get("hydrationMl", payload.get("waterMl", payload.get("hydration"))))
    record["note"] = as_text(payload.get("note"))

    meals = payload.get("meals", {})
    for meal_type in MEAL_TYPES:
        meal = meals.get(meal_type, {}) if isinstance(meals, dict) else {}
        record["meals"][meal_type] = {
            "planText": as_text(meal.get("planText", meal.get("plan"))),
            "actualText": as_text(meal.get("actualText", meal.get("actual"))),
            "calories": as_int(meal.get("calories")),
        }

    record["exerciseEntries"] = list(payload.get("exerciseEntries", []) or [])
    return record


def coerce_entry_values(values: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized_values = []
    for value in values or []:
        label = as_text(value.get("label", value.get("fieldKey"))) or "参数"
        value_text = as_text(value.get("valueText", value.get("value", value.get("targetValue"))))
        if not value_text:
            continue
        normalized_values.append(
            {
                "fieldKey": as_text(value.get("fieldKey")) or slugify_field_key(label),
                "label": label,
                "unit": as_text(value.get("unit")),
                "valueText": value_text,
            }
        )
    return normalized_values


def normalize_imported_record(
    conn: sqlite3.Connection,
    payload: dict[str, Any],
    fallback_date: str | None = None,
) -> tuple[dict[str, Any], list[str]]:
    version = as_text(payload.get("version"))
    if version and version != TRACKER_VERSION:
        raise ValueError(f"仅支持 {TRACKER_VERSION} 协议。")

    source = payload.get("record") or payload.get("nextDayPlan") or payload.get("dailyRecord") or payload
    if not isinstance(source, dict):
        raise ValueError("导入内容缺少 record 对象。")

    record = coerce_record_payload(source, fallback_date)
    exercise_types = fetch_exercise_types(conn)
    types_by_id = {exercise_type["id"]: exercise_type for exercise_type in exercise_types}
    types_by_name = {
        exercise_type["name"].strip().lower(): exercise_type for exercise_type in exercise_types
    }
    skipped_types: list[str] = []
    normalized_entries: list[dict[str, Any]] = []

    for entry in source.get("exerciseEntries", []) or []:
        if not isinstance(entry, dict):
            continue
        exercise_type = None
        exercise_type_id = as_int(entry.get("exerciseTypeId"))
        if exercise_type_id in types_by_id:
            exercise_type = types_by_id[exercise_type_id]
        else:
            exercise_type_name = as_text(entry.get("exerciseTypeName", entry.get("name"))).lower()
            if exercise_type_name:
                exercise_type = types_by_name.get(exercise_type_name)

        if exercise_type is None:
            skipped_types.append(
                as_text(entry.get("exerciseTypeName", entry.get("name"))) or "未命名运动"
            )
            continue

        normalized_entries.append(
            {
                "exerciseTypeId": exercise_type["id"],
                "exerciseTypeName": exercise_type["name"],
                "durationMinutes": as_float(
                    entry.get("durationMinutes", entry.get("duration", entry.get("targetMinutes")))
                ),
                "caloriesBurned": as_float(
                    entry.get("caloriesBurned", entry.get("calories", entry.get("targetCalories")))
                ),
                "intensity": as_text(entry.get("intensity")),
                "note": as_text(entry.get("note")),
                "values": coerce_entry_values(entry.get("values")),
            }
        )

    record["exerciseEntries"] = normalized_entries
    return record, skipped_types


def extract_tracker_json(raw_text: str) -> str:
    text = as_text(raw_text).strip()
    if TRACKER_BEGIN in text and TRACKER_END in text:
        start_index = text.rindex(TRACKER_BEGIN) + len(TRACKER_BEGIN)
        end_index = text.rindex(TRACKER_END)
        return text[start_index:end_index].strip()
    return text


def build_exchange_payload(conn: sqlite3.Connection, record_payload: dict[str, Any]) -> dict[str, Any]:
    record = coerce_record_payload(record_payload)
    next_date = (date.fromisoformat(record["date"]) + timedelta(days=1)).isoformat()
    profile = serialize_profile(conn)
    exercise_types = fetch_exercise_types(conn)
    return {
        "version": TRACKER_VERSION,
        "kind": "daily_record",
        "record": record,
        "profile": {
            "heightM": profile.get("heightM"),
            "startWeight": profile.get("startWeight"),
            "targetWeight": profile.get("targetWeight"),
            "goalDays": profile.get("goalDays"),
            "startDate": profile.get("startDate"),
            "currentBmi": profile.get("summary", {}).get("currentBmi"),
            "weeklyRate": profile.get("summary", {}).get("weeklyRate"),
        },
        "availableExerciseTypes": [
            {
                "name": exercise_type["name"],
                "fields": [
                    {
                        "label": field["label"],
                        "unit": field["unit"],
                    }
                    for field in exercise_type["fields"]
                ],
            }
            for exercise_type in exercise_types
        ],
        "responseContract": {
            "mustReturnVersion": TRACKER_VERSION,
            "mustReturnKind": "next_day_plan",
            "targetDate": next_date,
            "useExistingExerciseTypeNamesOnly": True,
            "replyWithChineseAnalysisFirst": True,
            "autoImportTarget": "record",
        },
        "responseTemplate": {
            "version": TRACKER_VERSION,
            "kind": "next_day_plan",
            "record": {
                "date": next_date,
                "weightKg": None,
                "intakeCalories": None,
                "extraBurnCalories": None,
                "stepCount": None,
                "sleepHours": None,
                "hydrationMl": None,
                "note": "",
                "meals": {
                    meal_type: {"planText": "", "actualText": "", "calories": None}
                    for meal_type in MEAL_TYPES
                },
                "exerciseEntries": [],
            },
        },
    }


def build_exchange_text(conn: sqlite3.Connection, record_payload: dict[str, Any]) -> str:
    record = coerce_record_payload(record_payload)
    profile = serialize_profile(conn)
    profile_summary = profile.get("summary", {})
    next_date = (date.fromisoformat(record["date"]) + timedelta(days=1)).isoformat()
    exercise_payload = build_exchange_payload(conn, record)

    meal_lines = "\n".join(
        [
            f"- {MEAL_LABELS[meal_type]}：计划={record['meals'][meal_type]['planText'] or '未填'}；"
            f"实际={record['meals'][meal_type]['actualText'] or '未填'}；"
            f"热量={record['meals'][meal_type]['calories'] if record['meals'][meal_type]['calories'] is not None else '--'} kcal"
            for meal_type in MEAL_TYPES
        ]
    )
    exercise_lines = "\n".join(
        [
            (
                f"- {entry.get('exerciseTypeName') or '运动'}，"
                f"{entry.get('durationMinutes') if entry.get('durationMinutes') is not None else '--'} 分钟，"
                f"{entry.get('caloriesBurned') if entry.get('caloriesBurned') is not None else '--'} kcal，"
                f"{entry.get('intensity') or '未填强度'}"
            )
            + (
                "，" + "，".join(
                    [
                        f"{value['label']}:{value['valueText']}{value['unit']}"
                        for value in entry.get("values", [])
                    ]
                )
                if entry.get("values")
                else ""
            )
            for entry in record.get("exerciseEntries", [])
        ]
    ) or "- 今天还没有录入运动。"

    return "\n".join(
        [
            "请根据以下健身记录帮我分析今天状态，并给出明天的运动目标和饮食建议：",
            f"日期：{record['date']}",
            f"体重：{record['weightKg'] if record['weightKg'] is not None else '--'} kg",
            f"摄入热量：{record['intakeCalories'] if record['intakeCalories'] is not None else '--'} kcal",
            f"额外热量消耗：{record['extraBurnCalories'] if record['extraBurnCalories'] is not None else '--'} kcal",
            f"步数：{record['stepCount'] if record['stepCount'] is not None else '--'}",
            f"睡眠：{record['sleepHours'] if record['sleepHours'] is not None else '--'} 小时",
            f"饮水：{record['hydrationMl'] if record['hydrationMl'] is not None else '--'} ml",
            f"当前 BMI：{profile_summary.get('currentBmi') if profile_summary.get('currentBmi') is not None else '--'}",
            f"目标节奏：{profile_summary.get('weeklyRate') if profile_summary.get('weeklyRate') is not None else '--'} kg/周",
            "三餐记录：",
            meal_lines,
            "运动记录：",
            exercise_lines,
            f"备注：{record['note'] or '无'}",
            "",
            "请先用中文分析今天状态，再返回一个可自动导入的次日计划数据块。",
            "回复要求：",
            f"1. 保留 {TRACKER_BEGIN} 和 {TRACKER_END} 标记",
            f"2. version 必须是 {TRACKER_VERSION}",
            "3. kind 必须是 next_day_plan",
            f"4. record.date 必须填写 {next_date}",
            "5. 运动项目名称只能使用 availableExerciseTypes 中已有的 name",
            "6. 三餐建议主要填写 meals.*.planText，actualText 可以留空",
            "7. 我会把你返回的完整数据块直接粘贴回软件自动导入",
            "",
            TRACKER_BEGIN,
            json.dumps(exercise_payload, ensure_ascii=False, indent=2),
            TRACKER_END,
        ]
    )


def export_exchange_block(conn: sqlite3.Connection, record_payload: dict[str, Any]) -> dict[str, Any]:
    payload = build_exchange_payload(conn, record_payload)
    return {
        "version": TRACKER_VERSION,
        "beginMarker": TRACKER_BEGIN,
        "endMarker": TRACKER_END,
        "payload": payload,
        "text": build_exchange_text(conn, record_payload),
        "targetDate": payload["responseContract"]["targetDate"],
    }


def import_exchange_block(
    conn: sqlite3.Connection,
    *,
    raw_text: str = "",
    payload: dict[str, Any] | None = None,
    fallback_date: str | None = None,
    save: bool = False,
) -> dict[str, Any]:
    parsed_payload = payload
    if parsed_payload is None:
        json_text = extract_tracker_json(raw_text)
        if not json_text:
            raise ValueError("导入内容不能为空。")
        parsed_payload = json.loads(json_text)
    if not isinstance(parsed_payload, dict):
        raise ValueError("导入内容必须是 JSON 对象。")

    record, skipped_types = normalize_imported_record(conn, parsed_payload, fallback_date)
    saved_record = save_record(conn, record["date"], record) if save else record
    return {
        "record": saved_record,
        "skippedTypes": skipped_types,
        "saved": save,
        "version": TRACKER_VERSION,
    }


def build_bootstrap(conn: sqlite3.Connection, selected_date: str) -> dict[str, Any]:
    return {
        "selectedDate": selected_date,
        "profile": serialize_profile(conn),
        "exerciseTypes": fetch_exercise_types(conn),
        "record": fetch_record(conn, selected_date),
        "defaultStats": fetch_stats(
            conn,
            (date.today() - timedelta(days=29)).isoformat(),
            date.today().isoformat(),
        ),
    }


class FitnessRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        return

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length).decode("utf-8") if length else "{}"
        return json.loads(raw_body or "{}")

    def handle_api_error(self, exc: Exception) -> None:
        status = 400
        if isinstance(exc, sqlite3.IntegrityError):
            message = "数据保存失败，可能是名称重复或该运动项目已经被历史记录使用。"
        else:
            message = str(exc) or "请求失败。"
        self.send_json({"ok": False, "error": message}, status=status)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.route_api("GET", parsed)
            return
        allowed_static_paths = {"/", "/index.html", "/styles.css", "/app.js"}
        if parsed.path not in allowed_static_paths:
            self.send_error(404, "File not found")
            return
        if parsed.path in ("/", ""):
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        self.route_api("POST", urlparse(self.path))

    def do_PUT(self) -> None:
        self.route_api("PUT", urlparse(self.path))

    def do_DELETE(self) -> None:
        self.route_api("DELETE", urlparse(self.path))

    def route_api(self, method: str, parsed: Any) -> None:
        try:
            initialize_database()
            path = parsed.path
            query = parse_qs(parsed.query)
            with get_connection() as conn:
                if method == "GET" and path == "/api/bootstrap":
                    selected_date = parse_iso_date(
                        query.get("date", [date.today().isoformat()])[0]
                    )
                    self.send_json({"ok": True, "data": build_bootstrap(conn, selected_date)})
                    return

                if method == "GET" and path == "/api/profile":
                    self.send_json({"ok": True, "data": serialize_profile(conn)})
                    return

                if method == "PUT" and path == "/api/profile":
                    payload = self.read_json_body()
                    data = save_profile(conn, payload)
                    self.send_json({"ok": True, "data": data})
                    return

                if method == "GET" and path == "/api/exercise-types":
                    self.send_json({"ok": True, "data": fetch_exercise_types(conn)})
                    return

                if method == "POST" and path == "/api/exercise-types":
                    payload = self.read_json_body()
                    insert_exercise_type(conn, payload)
                    self.send_json({"ok": True, "data": fetch_exercise_types(conn)}, status=201)
                    return

                if path.startswith("/api/exercise-types/"):
                    exercise_type_id = int(path.split("/")[-1])
                    if method == "PUT":
                        payload = self.read_json_body()
                        update_exercise_type(conn, exercise_type_id, payload)
                        self.send_json({"ok": True, "data": fetch_exercise_types(conn)})
                        return
                    if method == "DELETE":
                        conn.execute("DELETE FROM exercise_types WHERE id = ?", (exercise_type_id,))
                        self.send_json({"ok": True, "data": fetch_exercise_types(conn)})
                        return

                if method == "GET" and path == "/api/exchange/export":
                    record_date = parse_iso_date(
                        query.get("date", [date.today().isoformat()])[0]
                    )
                    self.send_json(
                        {"ok": True, "data": export_exchange_block(conn, fetch_record(conn, record_date))}
                    )
                    return

                if method == "POST" and path == "/api/exchange/export":
                    payload = self.read_json_body()
                    record_payload = payload.get("record") if isinstance(payload, dict) else None
                    if not isinstance(record_payload, dict):
                        raise ValueError("导出接口需要 record 对象。")
                    self.send_json({"ok": True, "data": export_exchange_block(conn, record_payload)})
                    return

                if method == "POST" and path == "/api/exchange/import":
                    payload = self.read_json_body()
                    import_result = import_exchange_block(
                        conn,
                        raw_text=as_text(payload.get("text")),
                        payload=payload.get("payload") if isinstance(payload.get("payload"), dict) else None,
                        fallback_date=as_text(payload.get("defaultDate")) or None,
                        save=bool(payload.get("save")),
                    )
                    self.send_json({"ok": True, "data": import_result})
                    return

                if path.startswith("/api/records/"):
                    record_date = path.split("/")[-1]
                    if method == "GET":
                        self.send_json({"ok": True, "data": fetch_record(conn, record_date)})
                        return
                    if method == "PUT":
                        payload = self.read_json_body()
                        self.send_json({"ok": True, "data": save_record(conn, record_date, payload)})
                        return
                    if method == "DELETE":
                        delete_record(conn, record_date)
                        self.send_json({"ok": True, "data": empty_record(record_date)})
                        return

                if method == "GET" and path == "/api/stats":
                    start_date = parse_iso_date(
                        query.get("start", [(date.today() - timedelta(days=29)).isoformat()])[0]
                    )
                    end_date = parse_iso_date(query.get("end", [date.today().isoformat()])[0])
                    self.send_json({"ok": True, "data": fetch_stats(conn, start_date, end_date)})
                    return

            self.send_json({"ok": False, "error": "接口不存在。"}, status=404)
        except Exception as exc:  # noqa: BLE001
            self.handle_api_error(exc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="健身记录与体重追踪系统")
    parser.add_argument("--host", default="127.0.0.1", help="服务监听地址")
    parser.add_argument("--port", type=int, default=8000, help="服务端口")
    parser.add_argument(
        "--init-only",
        action="store_true",
        help="只初始化数据库，不启动服务",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    initialize_database()
    if args.init_only:
        print(f"Database initialized at {DB_PATH}")
        return

    server = ThreadingHTTPServer((args.host, args.port), FitnessRequestHandler)
    print(f"Fitness tracker running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
