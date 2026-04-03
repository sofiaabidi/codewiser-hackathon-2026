"""
PathForge — Flask Application
REST API for career skill gap analysis, knowledge graph diagnosis,
study optimization, and spaced repetition.
All deterministic — no LLMs.
"""

import os
from functools import wraps
from typing import Optional
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, jsonify, request, redirect, session
from flask_cors import CORS
import math
from authlib.integrations.flask_client import OAuth
from engines.gap_analysis import get_all_roles, get_role_skills, analyze_gap
from engines.knowledge_graph import get_concept_subgraph, diagnose_knowledge_gaps
from engines.study_optimizer import (
    generate_study_plan,
    get_spaced_repetition_schedule,
    compute_priorities,
)
from engines.mastery_update import compute_mastery_updates, filter_remaining_gaps

app = Flask(__name__)

from persistence import (
    init_db,
    upsert_user,
    get_user,
    list_study_sessions,
    upsert_study_session,
    get_study_session,
    delete_study_session,
)

init_db()

# CORS: we need cookie-based auth for /api/sessions and /api/auth/*.
DEFAULT_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]
frontend_origins = os.environ.get("FRONTEND_ORIGINS", "")
allowed_origins = [o.strip() for o in frontend_origins.split(",") if o.strip()]
if not allowed_origins:
    allowed_origins = DEFAULT_ORIGINS

frontend_base_url = os.environ.get("FRONTEND_BASE_URL", allowed_origins[0]).rstrip("/")

app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-change-me")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("FLASK_COOKIE_SECURE", "0") == "1",
)

CORS(app, origins=allowed_origins, supports_credentials=True)

oauth = OAuth(app)


def _github_oauth_is_configured() -> bool:
    return bool(os.environ.get("GITHUB_CLIENT_ID")) and bool(os.environ.get("GITHUB_CLIENT_SECRET"))

oauth.register(
    name="github",
    client_id=os.environ.get("GITHUB_CLIENT_ID", ""),
    client_secret=os.environ.get("GITHUB_CLIENT_SECRET", ""),
    access_token_url="https://github.com/login/oauth/access_token",
    authorize_url="https://github.com/login/oauth/authorize",
    api_base_url="https://api.github.com/",
    client_kwargs={"scope": "read:user user:email"},
)


def _require_login() -> Optional[str]:
    return session.get("user_id")


# ─── Auth ───────────────────────────────────────────────────────
@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user_id = _require_login()
    if not user_id:
        return jsonify({"user": None})
    user = get_user(user_id)
    return jsonify({"user": user})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/login/github", methods=["GET"])
def auth_login_github():
    if not _github_oauth_is_configured():
        return jsonify({"error": "GitHub OAuth not configured"}), 500
    oauth_redirect_base_url = os.getenv("OAUTH_REDIRECT_BASE_URL", "http://localhost:5000").rstrip("/")
    redirect_uri = f"{oauth_redirect_base_url}/api/auth/callback/github"
    return oauth.github.authorize_redirect(redirect_uri)


@app.route("/api/auth/callback/github", methods=["GET"])
def auth_callback_github():
    try:
        oauth.github.authorize_access_token()
        user_info = oauth.github.get("user").json()
        provider_sub = str(user_info.get("id") or "")

        email = None
        try:
            emails = oauth.github.get("user/emails").json()
            if isinstance(emails, list):
                primary = next((e for e in emails if e.get("primary")), None)
                email = primary.get("email") if primary else (emails[0].get("email") if emails else None)
        except Exception:
            email = None

        name = user_info.get("name") or user_info.get("login")
        if not provider_sub:
            return redirect(f"{frontend_base_url}/?auth=error")

        user_id = f"github:{provider_sub}"
        upsert_user(user_id, provider="github", email=email, name=name)
        session["user_id"] = user_id
        return redirect(f"{frontend_base_url}/?auth=success")
    except Exception:
        return redirect(f"{frontend_base_url}/?auth=error")


# ─── Study Session Persistence ────────────────────────────────
@app.route("/api/sessions", methods=["GET"])
def sessions_list():
    user_id = _require_login()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"sessions": list_study_sessions(user_id)})


@app.route("/api/sessions/<int:session_id>", methods=["GET"])
def sessions_get(session_id: int):
    user_id = _require_login()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    session_data = get_study_session(user_id, session_id)
    if not session_data:
        return jsonify({"error": "Session not found"}), 404
    return jsonify({"session": session_data})


@app.route("/api/sessions/<int:session_id>", methods=["DELETE"])
def sessions_delete(session_id: int):
    user_id = _require_login()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    delete_study_session(user_id, session_id)
    return jsonify({"ok": True})


@app.route("/api/sessions/save", methods=["POST"])
def sessions_save():
    user_id = _require_login()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    role_id = data.get("role_id")
    role_title = data.get("role_title")
    step_key = data.get("step_key")
    state = data.get("state")

    if not role_id or not step_key or state is None:
        return jsonify({"error": "role_id, step_key, and state are required"}), 400

    session_id = upsert_study_session(
        user_id=user_id,
        role_id=role_id,
        role_title=role_title,
        step_key=step_key,
        state=state,
    )
    return jsonify({"session_id": session_id})


# ─── Health Check ────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "PathForge API", "version": "1.0.0"})


# ─── Module 1: Career Skill Gap Analysis ────────────────────────

@app.route("/api/roles", methods=["GET"])
def list_roles():
    roles = get_all_roles()
    return jsonify({"roles": roles})


@app.route("/api/roles/<role_id>/skills", methods=["GET"])
def role_skills(role_id):
    result = get_role_skills(role_id)
    if result is None:
        return jsonify({"error": f"Role '{role_id}' not found"}), 404
    return jsonify(result)


@app.route("/api/analyze-gap", methods=["POST"])
def gap_analysis():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400
    role_id = data.get("role_id")
    user_skills = data.get("user_skills", {})
    if not role_id:
        return jsonify({"error": "'role_id' is required"}), 400
    result = analyze_gap(role_id, user_skills)
    if "error" in result:
        return jsonify(result), 404
    return jsonify(result)


# ─── Module 2: Knowledge Dependency Graph ────────────────────────

@app.route("/api/knowledge-graph", methods=["POST"])
def knowledge_graph():
    """
    Get the prerequisite subgraph for given skills.
    Body: { "skill_ids": ["machine_learning", "sql"] }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400
    skill_ids = data.get("skill_ids", [])
    if not skill_ids:
        return jsonify({"error": "'skill_ids' is required"}), 400
    result = get_concept_subgraph(skill_ids)
    return jsonify(result)


@app.route("/api/diagnose", methods=["POST"])
def diagnose():
    """
    Diagnose knowledge gaps for given skills.
    Body: {
        "skill_ids": ["machine_learning", "sql"],
        "mastery_scores": { "python_basics": 0.9, "matrices": 0.3, ... }
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400
    skill_ids = data.get("skill_ids", [])
    mastery_scores = data.get("mastery_scores", {})
    if not skill_ids:
        return jsonify({"error": "'skill_ids' is required"}), 400
    result = diagnose_knowledge_gaps(skill_ids, mastery_scores)
    return jsonify(result)


# ─── Module 3 & 4: Study Plan ────────────────────────────────────

@app.route("/api/study-plan", methods=["POST"])
def study_plan():
    """
    Generate a study plan from diagnosed gaps.
    Body: {
        "gaps": [{ "id", "name", "difficulty", "estimated_hours", "mastery", ... }],
        "mastery_scores": { "concept_id": 0.0-1.0, ... },
        "career_weights": { "skill_id": weight, ... },
        "daily_hours": 4,
        "total_days": 14 (optional; if omitted, computed automatically)
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    gaps = data.get("gaps", [])
    mastery_scores = data.get("mastery_scores", {})
    career_weights = data.get("career_weights", {})
    daily_hours = data.get("daily_hours", 4)
    total_days = data.get("total_days")
    if total_days is not None:
        try:
            total_days = int(total_days)
        except Exception:
            total_days = None

    if not gaps:
        return jsonify({"error": "'gaps' is required"}), 400

    result = generate_study_plan(
        gaps, mastery_scores, career_weights,
        daily_hours=daily_hours, total_days=total_days
    )
    return jsonify(result)


# ─── Module 5: Spaced Repetition ─────────────────────────────────

@app.route("/api/spaced-repetition", methods=["POST"])
def spaced_repetition():
    """
    Generate a spaced repetition review schedule.
    Body: {
        "topics": [{ "id", "name", "mastery" }, ...],
        "total_days": 30
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    topics = data.get("topics", [])
    total_days = data.get("total_days", 30)

    if not topics:
        return jsonify({"error": "'topics' is required"}), 400

    result = get_spaced_repetition_schedule(topics, total_days=total_days)
    return jsonify(result)


# ─── Module 6: Iterative Learning Update ─────────────────────────

@app.route("/api/complete-day", methods=["POST"])
def complete_day():
    """
    Atomically: update mastery → re-diagnose gaps → regenerate study plan.
    Body: {
        "completed_topics": [{"topic_id", "topic_name", "minutes_spent", "expected_minutes"}],
        "completed_reviews": [{"topic_id", "topic_name", "review_number"}],
        "current_mastery": { concept_id: 0.0-1.0, ... },
        "skill_ids": ["machine_learning", ...],
        "career_weights": { skill_id: weight, ... },
        "remaining_gaps": [{ gap concept dicts }],
        "daily_hours": 4,
        "remaining_days": 10
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    completed_topics = data.get("completed_topics", [])
    completed_reviews = data.get("completed_reviews", [])
    current_mastery = data.get("current_mastery", {})
    skill_ids = data.get("skill_ids", [])
    career_weights = data.get("career_weights", {})
    remaining_gaps = data.get("remaining_gaps", [])
    daily_hours = data.get("daily_hours", 4)
    remaining_days = data.get("remaining_days", 10)

    # Step 1: Update mastery scores deterministically
    mastery_result = compute_mastery_updates(
        completed_topics, completed_reviews, current_mastery
    )
    updated_mastery = mastery_result["updated_mastery"]
    mastery_changes = mastery_result["changes"]

    # Step 2: Filter out now-mastered gaps
    still_gaps = filter_remaining_gaps(remaining_gaps, updated_mastery)

    # Step 3: Re-run knowledge gap diagnosis with new mastery
    diagnosis = None
    if skill_ids:
        diagnosis = diagnose_knowledge_gaps(skill_ids, updated_mastery)

    # Step 4: Regenerate study plan for remaining days.
    # If timeline is exhausted but gaps still remain, auto-extend the plan.
    new_plan = None
    auto_extended_days = 0
    plan_days = remaining_days
    if still_gaps and plan_days <= 0:
        total_remaining_hours = 0.0
        for g in still_gaps:
            current = updated_mastery.get(g.get("id"), g.get("mastery", 0.0))
            deficit = max(0.0, 1.0 - current)
            total_remaining_hours += g.get("estimated_hours", 2) * deficit

        # Heuristic: add enough days to cover remaining estimated work,
        # minimum 2 days so optimizer can place study + reviews.
        min_daily = max(float(daily_hours), 1.0)
        auto_extended_days = max(2, int(math.ceil(total_remaining_hours / min_daily)))
        plan_days = auto_extended_days

    if still_gaps and plan_days > 0:
        new_plan = generate_study_plan(
            still_gaps, updated_mastery, career_weights,
            daily_hours=daily_hours, total_days=plan_days
        )

    return jsonify({
        "updated_mastery": updated_mastery,
        "mastery_changes": mastery_changes,
        "gaps_remaining": len(still_gaps),
        "gaps_resolved": len(remaining_gaps) - len(still_gaps),
        "diagnosis": diagnosis,
        "study_plan": new_plan,
        "auto_extended_days": auto_extended_days,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
