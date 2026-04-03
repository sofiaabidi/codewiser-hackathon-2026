import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


DB_PATH = os.environ.get(
    "PATHFORGE_DB_PATH",
    os.path.join(os.path.dirname(__file__), "pathforge.sqlite3"),
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              user_id TEXT PRIMARY KEY,
              provider TEXT NOT NULL,
              email TEXT,
              name TEXT,
              created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS study_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              role_id TEXT NOT NULL,
              role_title TEXT,
              step_key TEXT NOT NULL,
              state_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(user_id, role_id)
            )
            """
        )


def upsert_user(user_id: str, provider: str, email: Optional[str], name: Optional[str]) -> None:
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO users (user_id, provider, email, name, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              provider=excluded.provider,
              email=COALESCE(excluded.email, users.email),
              name=COALESCE(excluded.name, users.name)
            """,
            (user_id, provider, email, name, _utc_now_iso()),
        )


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    with _get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        if not row:
            return None
        return dict(row)


def upsert_study_session(
    user_id: str,
    role_id: str,
    role_title: Optional[str],
    step_key: str,
    state: dict,
) -> int:
    state_json = json.dumps(state, ensure_ascii=False)
    with _get_conn() as conn:
        now = _utc_now_iso()
        conn.execute(
            """
            INSERT INTO study_sessions (user_id, role_id, role_title, step_key, state_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, role_id) DO UPDATE SET
              role_title=COALESCE(excluded.role_title, study_sessions.role_title),
              step_key=excluded.step_key,
              state_json=excluded.state_json,
              updated_at=excluded.updated_at
            """,
            (user_id, role_id, role_title, step_key, state_json, now, now),
        )
        row = conn.execute(
            """
            SELECT id FROM study_sessions
            WHERE user_id = ? AND role_id = ?
            """,
            (user_id, role_id),
        ).fetchone()
        return int(row["id"])


def _safe_load_state(state_json: str) -> Dict[str, Any]:
    try:
        return json.loads(state_json)
    except Exception:
        return {}


def list_study_sessions(user_id: str) -> List[Dict[str, Any]]:
    step_index = {
        "select_role": 0,
        "input_skills": 1,
        "gap_report": 2,
        "knowledge_graph": 3,
        "study_plan": 4,
    }
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, role_id, role_title, step_key, state_json, updated_at
            FROM study_sessions
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,),
        ).fetchall()

    sessions: List[Dict[str, Any]] = []
    for row in rows:
        state = _safe_load_state(row["state_json"])
        gap_report = state.get("gapReport")
        study_data = state.get("studyData")
        career_fit_percent = None
        if isinstance(gap_report, dict):
            career_fit_percent = gap_report.get("career_fit_percent")

        completed_days = []
        total_days = None
        if isinstance(study_data, dict):
            completed_days = study_data.get("completedDays") or []
            plan = study_data.get("studyPlan") or {}
            summary = plan.get("summary") or {}
            total_days = summary.get("total_days")

        step_i = step_index.get(row["step_key"], 0)
        progress_percent = (step_i + 1) / 5 * 100
        # If they're in the study plan module, reflect actual day completion.
        if row["step_key"] == "study_plan" and total_days:
            base_segment = 100 / 5
            ratio = len(completed_days) / total_days if total_days > 0 else 0
            ratio = min(1, max(0, ratio))
            progress_percent = step_i * base_segment + ratio * base_segment

        sessions.append(
            {
                "id": int(row["id"]),
                "role_id": row["role_id"],
                "role_title": row["role_title"] or row["role_id"],
                "step_key": row["step_key"],
                "updated_at": row["updated_at"],
                "progress_percent": round(progress_percent, 2),
                "metrics": {
                    "career_fit_percent": career_fit_percent,
                    "days_done": len(completed_days),
                    "total_days": total_days,
                },
            }
        )
    return sessions


def get_study_session(user_id: str, session_id: int) -> Optional[Dict[str, Any]]:
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, role_id, role_title, step_key, state_json
            FROM study_sessions
            WHERE user_id = ? AND id = ?
            """,
            (user_id, session_id),
        ).fetchone()
        if not row:
            return None
        return {
            "id": int(row["id"]),
            "role_id": row["role_id"],
            "role_title": row["role_title"],
            "step_key": row["step_key"],
            "state": _safe_load_state(row["state_json"]),
        }


def delete_study_session(user_id: str, session_id: int) -> None:
    with _get_conn() as conn:
        conn.execute(
            "DELETE FROM study_sessions WHERE user_id = ? AND id = ?",
            (user_id, session_id),
        )

