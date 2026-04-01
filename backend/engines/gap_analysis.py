"""
PathForge — Gap Analysis Engine
Deterministic skill gap detection and career fit scoring.
No LLMs. Pure algorithmic intelligence.
"""

import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def load_career_data():
    """Load the career skills graph from JSON."""
    path = os.path.join(DATA_DIR, "career_skills.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_all_roles():
    """Return a summary list of all available career roles."""
    data = load_career_data()
    roles = []
    for role_id, role in data["roles"].items():
        roles.append({
            "id": role_id,
            "title": role["title"],
            "description": role["description"],
            "icon": role["icon"],
            "color": role["color"],
            "skill_count": len(role["skills"]),
        })
    return roles


def get_role_skills(role_id):
    """Return the full skill requirements for a role."""
    data = load_career_data()
    role = data["roles"].get(role_id)
    if not role:
        return None

    skills = []
    for skill_id, skill in role["skills"].items():
        skills.append({
            "id": skill_id,
            "name": skill["name"],
            "weight": skill["weight"],
            "category": skill["category"],
            "description": skill["description"],
        })

    # Sort by weight descending (most important first)
    skills.sort(key=lambda s: s["weight"], reverse=True)

    return {
        "role_id": role_id,
        "title": role["title"],
        "description": role["description"],
        "icon": role["icon"],
        "color": role["color"],
        "skills": skills,
    }


def analyze_gap(role_id, user_skills):
    """
    Core gap analysis algorithm.

    Parameters:
        role_id (str): Target career role ID
        user_skills (dict): { skill_id: { "proficiency": 0.0-1.0 }, ... }

    Returns:
        dict: Full gap analysis report with career_fit score and skill breakdown

    Algorithm:
        1. For each required skill in the role:
           - If user doesn't have it → MISSING
           - If proficiency < 0.6 → PARTIAL (needs improvement)
           - If proficiency >= 0.6 → MASTERED
        2. career_fit = Σ(weight × proficiency) / Σ(weight)
        3. Classify career_fit into a readiness label
    """
    data = load_career_data()
    role = data["roles"].get(role_id)
    if not role:
        return {"error": f"Role '{role_id}' not found"}

    required_skills = role["skills"]

    mastered = []
    partial = []
    missing = []

    weighted_score = 0.0
    total_weight = 0.0

    for skill_id, skill_config in required_skills.items():
        weight = skill_config["weight"]
        total_weight += weight

        user_skill = user_skills.get(skill_id, {})
        proficiency = user_skill.get("proficiency", 0.0)

        skill_entry = {
            "id": skill_id,
            "name": skill_config["name"],
            "weight": weight,
            "category": skill_config["category"],
            "description": skill_config["description"],
        }

        if proficiency <= 0.0:
            # User doesn't know this skill at all
            skill_entry["proficiency"] = 0.0
            skill_entry["gap_severity"] = "critical"
            missing.append(skill_entry)
        elif proficiency < 0.6:
            # User has some knowledge but below threshold
            skill_entry["proficiency"] = proficiency
            skill_entry["gap_severity"] = "moderate"
            partial.append(skill_entry)
            weighted_score += weight * proficiency
        else:
            # User has adequate proficiency
            skill_entry["proficiency"] = proficiency
            skill_entry["gap_severity"] = "none"
            mastered.append(skill_entry)
            weighted_score += weight * proficiency

    # Calculate career fit score (0.0 to 1.0)
    career_fit = weighted_score / total_weight if total_weight > 0 else 0.0
    career_fit = round(career_fit, 4)

    # Determine readiness label
    if career_fit >= 0.85:
        fit_label = "Ready"
        fit_description = "You're well-prepared for this role!"
    elif career_fit >= 0.65:
        fit_label = "Almost There"
        fit_description = "A few more skills and you're ready."
    elif career_fit >= 0.4:
        fit_label = "Making Progress"
        fit_description = "You have a solid foundation to build on."
    elif career_fit >= 0.2:
        fit_label = "Early Stage"
        fit_description = "You've started the journey — keep going!"
    else:
        fit_label = "Getting Started"
        fit_description = "A great time to start learning!"

    # Sort each category by weight (most important gaps first)
    missing.sort(key=lambda s: s["weight"], reverse=True)
    partial.sort(key=lambda s: s["weight"], reverse=True)
    mastered.sort(key=lambda s: s["weight"], reverse=True)

    # Build category summary for radar chart
    categories = {}
    for skill_id, skill_config in required_skills.items():
        cat = skill_config["category"]
        if cat not in categories:
            categories[cat] = {"total_weight": 0, "achieved_score": 0}
        categories[cat]["total_weight"] += skill_config["weight"]
        prof = user_skills.get(skill_id, {}).get("proficiency", 0.0)
        categories[cat]["achieved_score"] += skill_config["weight"] * prof

    category_scores = {}
    for cat, vals in categories.items():
        category_scores[cat] = round(
            vals["achieved_score"] / vals["total_weight"], 4
        ) if vals["total_weight"] > 0 else 0.0

    return {
        "career_fit": career_fit,
        "career_fit_percent": round(career_fit * 100, 1),
        "career_fit_label": fit_label,
        "career_fit_description": fit_description,
        "target_role": role["title"],
        "target_role_id": role_id,
        "summary": {
            "total_skills": len(required_skills),
            "mastered": len(mastered),
            "partial": len(partial),
            "missing": len(missing),
        },
        "skills": {
            "mastered": mastered,
            "partial": partial,
            "missing": missing,
        },
        "category_scores": category_scores,
    }
