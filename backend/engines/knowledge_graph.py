"""
PathForge — Knowledge Graph Engine (Module 2)
DAG traversal, mastery propagation, and root knowledge gap detection.
All deterministic — no LLMs.
"""

import json
import os
from collections import deque

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def load_concept_graph():
    path = os.path.join(DATA_DIR, "concept_graph.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_concept_subgraph(skill_ids):
    """
    Build the full prerequisite subgraph for a list of skill IDs.
    Uses BFS to expand all prerequisites recursively.
    Returns nodes and edges for visualization.
    """
    data = load_concept_graph()
    concepts = data["concepts"]

    visited = set()
    queue = deque(skill_ids)
    nodes = []
    edges = []

    while queue:
        cid = queue.popleft()
        if cid in visited or cid not in concepts:
            continue
        visited.add(cid)

        concept = concepts[cid]
        nodes.append({
            "id": cid,
            "name": concept["name"],
            "category": concept["category"],
            "difficulty": concept["difficulty"],
            "estimated_hours": concept["estimated_hours"],
            "description": concept["description"],
            "is_root_skill": cid in skill_ids,
        })

        for prereq_id in concept.get("prerequisites", []):
            edges.append({"from": prereq_id, "to": cid})
            if prereq_id not in visited:
                queue.append(prereq_id)

    return {"nodes": nodes, "edges": edges}


def diagnose_knowledge_gaps(skill_ids, mastery_scores):
    """
    Core diagnosis algorithm for Module 2.

    Given missing/partial skills and user mastery scores for prerequisite concepts,
    identify root knowledge gaps — the deepest prerequisites with low mastery.

    Algorithm:
        1. Expand skills into full prerequisite DAG via BFS
        2. For each node, check mastery score (default 0 for unknown)
        3. Mark nodes with mastery < 0.6 as gaps
        4. Find ROOT gaps: gaps whose prerequisites are ALL mastered (>= 0.6)
           These are the foundational topics the user should study first.
        5. Compute readiness for each skill based on prerequisite mastery

    Parameters:
        skill_ids (list): Skills to diagnose (from gap analysis missing/partial)
        mastery_scores (dict): { concept_id: 0.0-1.0, ... }

    Returns:
        dict: Full diagnosis with gaps, root gaps, and graph data
    """
    data = load_concept_graph()
    concepts = data["concepts"]

    # Step 1: Build full subgraph
    subgraph = get_concept_subgraph(skill_ids)
    all_concept_ids = {n["id"] for n in subgraph["nodes"]}

    # Step 2: Assess mastery for each concept
    assessed = {}
    for cid in all_concept_ids:
        mastery = mastery_scores.get(cid, 0.0)
        concept = concepts.get(cid, {})
        assessed[cid] = {
            "id": cid,
            "name": concept.get("name", cid),
            "category": concept.get("category", "unknown"),
            "difficulty": concept.get("difficulty", 0.5),
            "estimated_hours": concept.get("estimated_hours", 5),
            "mastery": mastery,
            "is_gap": mastery < 0.6,
            "prerequisites": concept.get("prerequisites", []),
        }

    # Step 3: Identify all gaps
    gaps = {cid: info for cid, info in assessed.items() if info["is_gap"]}

    # Step 4: Find ROOT gaps (gaps whose prereqs are all mastered or not in graph)
    root_gaps = []
    non_root_gaps = []
    for cid, info in gaps.items():
        prereqs_in_graph = [p for p in info["prerequisites"] if p in all_concept_ids]
        if not prereqs_in_graph:
            # No prerequisites in graph — this is a leaf/root
            root_gaps.append(info)
        else:
            all_prereqs_ok = all(
                assessed.get(p, {}).get("mastery", 0) >= 0.6
                for p in prereqs_in_graph
            )
            if all_prereqs_ok:
                root_gaps.append(info)
            else:
                non_root_gaps.append(info)

    # Sort root gaps: lowest mastery first, then highest difficulty
    root_gaps.sort(key=lambda g: (g["mastery"], -g["difficulty"]))
    non_root_gaps.sort(key=lambda g: (g["mastery"], -g["difficulty"]))

    # Step 5: Compute readiness for each target skill
    skill_readiness = []
    for sid in skill_ids:
        if sid not in concepts:
            continue
        concept = concepts[sid]
        prereqs = concept.get("prerequisites", [])
        if not prereqs:
            readiness = mastery_scores.get(sid, 0.0)
        else:
            prereq_masteries = [mastery_scores.get(p, 0.0) for p in prereqs if p in all_concept_ids]
            readiness = sum(prereq_masteries) / len(prereq_masteries) if prereq_masteries else 0.0

        skill_readiness.append({
            "id": sid,
            "name": concept["name"],
            "readiness": round(readiness, 4),
            "mastery": mastery_scores.get(sid, 0.0),
            "total_prereqs": len(prereqs),
            "mastered_prereqs": sum(1 for p in prereqs if mastery_scores.get(p, 0.0) >= 0.6),
        })

    skill_readiness.sort(key=lambda s: s["readiness"])

    # Annotate graph nodes with mastery and gap status
    for node in subgraph["nodes"]:
        node["mastery"] = mastery_scores.get(node["id"], 0.0)
        node["is_gap"] = node["mastery"] < 0.6
        node["is_root_gap"] = any(rg["id"] == node["id"] for rg in root_gaps)

    return {
        "summary": {
            "total_concepts": len(all_concept_ids),
            "total_gaps": len(gaps),
            "root_gaps": len(root_gaps),
            "mastered_concepts": len(all_concept_ids) - len(gaps),
        },
        "root_gaps": root_gaps,
        "other_gaps": non_root_gaps,
        "skill_readiness": skill_readiness,
        "graph": subgraph,
    }
