"""
PathForge — Flask Application
REST API for career skill gap analysis, knowledge graph diagnosis,
study optimization, and spaced repetition.
All deterministic — no LLMs.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from engines.gap_analysis import get_all_roles, get_role_skills, analyze_gap
from engines.knowledge_graph import get_concept_subgraph, diagnose_knowledge_gaps
from engines.study_optimizer import (
    generate_study_plan,
    get_spaced_repetition_schedule,
    compute_priorities,
)

app = Flask(__name__)
CORS(app)


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
        "total_days": 14
    }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    gaps = data.get("gaps", [])
    mastery_scores = data.get("mastery_scores", {})
    career_weights = data.get("career_weights", {})
    daily_hours = data.get("daily_hours", 4)
    total_days = data.get("total_days", 14)

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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
