"""
PathForge — Study Optimizer Engine (Modules 3, 4, 5)
Priority scoring, topological scheduling, and spaced repetition.
All deterministic — no LLMs.
"""

import json
import os
import math
from collections import deque, defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def load_concept_graph():
    path = os.path.join(DATA_DIR, "concept_graph.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def compute_priorities(gaps, mastery_scores, career_weights):
    """
    Module 3: Compute study priority for each gap topic.

    Formula: priority = difficulty × (1 - mastery) × career_importance

    Parameters:
        gaps (list): List of gap concept dicts from knowledge graph diagnosis
        mastery_scores (dict): { concept_id: 0.0-1.0 }
        career_weights (dict): { skill_id: weight } from the target role

    Returns:
        list: Sorted list of topics with priority scores
    """
    prioritized = []
    for gap in gaps:
        cid = gap["id"]
        mastery = mastery_scores.get(cid, 0.0)
        difficulty = gap.get("difficulty", 0.5)

        # Career importance: check if this concept is directly a career skill
        career_imp = career_weights.get(cid, 0.3)  # default 0.3 for prerequisites

        priority = difficulty * (1.0 - mastery) * career_imp
        priority = round(priority, 4)

        prioritized.append({
            "id": cid,
            "name": gap.get("name", cid),
            "category": gap.get("category", "unknown"),
            "difficulty": difficulty,
            "mastery": mastery,
            "career_importance": career_imp,
            "priority": priority,
            "estimated_hours": gap.get("estimated_hours", 5),
            "is_root_gap": gap.get("is_root_gap", False),
        })

    prioritized.sort(key=lambda t: t["priority"], reverse=True)
    return prioritized


def topological_sort_gaps(gaps, concept_data):
    """
    Topological sort of gap concepts respecting prerequisite order.
    Uses Kahn's algorithm (BFS-based).
    """
    concepts = concept_data["concepts"]
    gap_ids = {g["id"] for g in gaps}

    # Build adjacency within gap set only
    in_degree = defaultdict(int)
    adj = defaultdict(list)
    for gid in gap_ids:
        in_degree.setdefault(gid, 0)
        prereqs = concepts.get(gid, {}).get("prerequisites", [])
        for p in prereqs:
            if p in gap_ids:
                adj[p].append(gid)
                in_degree[gid] += 1

    # Kahn's algorithm
    queue = deque([gid for gid in gap_ids if in_degree[gid] == 0])
    sorted_order = []
    while queue:
        node = queue.popleft()
        sorted_order.append(node)
        for neighbor in adj[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return sorted_order


def generate_study_plan(gaps, mastery_scores, career_weights, daily_hours=4, total_days=None):
    """
    Module 4: Generate a day-by-day study schedule.

    Algorithm:
        1. Compute priorities for all gap topics
        2. Topological sort to respect prerequisites
        3. Merge: sort by topo order, break ties by priority
        4. Greedy bin-packing into daily time slots
        5. Add review sessions based on spaced repetition

    Parameters:
        gaps (list): All gap concepts
        mastery_scores (dict): Current mastery for each concept
        career_weights (dict): Skill weights from career role
        daily_hours (int): Available study hours per day
        total_days (int|None): Number of days to plan (optional; if None, computed)

    Returns:
        dict: Complete study plan with daily schedules
    """
    concept_data = load_concept_graph()

    # Step 1: Compute priorities
    prioritized = compute_priorities(gaps, mastery_scores, career_weights)
    priority_map = {t["id"]: t for t in prioritized}

    # Step 2: Topological sort
    topo_order = topological_sort_gaps(gaps, concept_data)

    # Step 3: Merge — use topo order, break ties by priority
    ordered_topics = []
    for cid in topo_order:
        if cid in priority_map:
            ordered_topics.append(priority_map[cid])

    # Add any remaining (not in topo sort due to missing nodes)
    topo_set = set(topo_order)
    for t in prioritized:
        if t["id"] not in topo_set:
            ordered_topics.append(t)

    # Step 4: Greedy bin-packing into days
    daily_minutes = daily_hours * 60
    schedule = []
    review_queue = []  # dicts: {day_due, topic_id, ...}

    # Track remaining minutes per topic so "finish everything" is meaningful.
    # required_minutes is scaled by (1 - mastery), capped to at least 30 minutes total.
    remaining_by_id = {}
    for t in ordered_topics:
        required = int(t["estimated_hours"] * 60 * (1 - t["mastery"]))
        remaining_by_id[t["id"]] = max(required, 30)

    computed_days = total_days is None

    def compute_min_days_to_finish():
        if daily_minutes <= 0:
            return 1
        # Per-topic daily cap is 120 minutes (same as the scheduler), so a topic may span multiple days.
        total_chunks = 0
        for t in ordered_topics:
            rem = remaining_by_id.get(t["id"], 0)
            chunks = math.ceil(rem / 120) if rem > 0 else 0
            total_chunks += max(chunks, 1) if rem > 0 else 0
        # Worst-case: 30 minutes per chunk; but we can do better by simulating packing:
        # Use total required minutes for a lower bound.
        total_required = sum(remaining_by_id.values())
        lower_bound = math.ceil(total_required / daily_minutes) if total_required > 0 else 1
        # Add a small buffer for reviews within the same horizon.
        return max(1, lower_bound)

    if computed_days:
        total_days = compute_min_days_to_finish()

    topic_idx = 0
    day = 1
    while day <= total_days:
        day_plan = {
            "day": day,
            "topics": [],
            "reviews": [],
            "total_study_minutes": 0,
            "total_review_minutes": 0,
        }
        remaining_minutes = daily_minutes

        # First: handle reviews due today
        due_reviews = [r for r in review_queue if r["day_due"] <= day]
        review_queue = [r for r in review_queue if r["day_due"] > day]

        for review in due_reviews:
            review_time = 15  # 15 min per review session
            if remaining_minutes >= review_time:
                day_plan["reviews"].append({
                    "topic_id": review["topic_id"],
                    "topic_name": review["topic_name"],
                    "review_number": review["review_number"],
                    "minutes": review_time,
                })
                day_plan["total_review_minutes"] += review_time
                remaining_minutes -= review_time

                # Schedule next review (spaced repetition)
                next_interval = compute_review_interval(
                    review["review_number"] + 1,
                    review.get("retention", 0.5)
                )
                if day + next_interval <= total_days:
                    review_queue.append({
                        "topic_id": review["topic_id"],
                        "topic_name": review["topic_name"],
                        "review_number": review["review_number"] + 1,
                        "retention": min(review.get("retention", 0.5) + 0.1, 0.95),
                        "day_due": day + next_interval,
                    })

        # Then: study topics (may span multiple days)
        while topic_idx < len(ordered_topics) and remaining_minutes >= 30:
            topic = ordered_topics[topic_idx]
            tid = topic["id"]
            remaining_for_topic = remaining_by_id.get(tid, 0)

            if remaining_for_topic <= 0:
                topic_idx += 1
                continue

            study_minutes = min(
                remaining_for_topic,
                remaining_minutes,
                120  # max 2hr per topic per day
            )
            study_minutes = max(study_minutes, 30)  # min 30 min sessions

            if study_minutes > remaining_minutes:
                break

            day_plan["topics"].append({
                "topic_id": topic["id"],
                "topic_name": topic["name"],
                "category": topic["category"],
                "difficulty": topic["difficulty"],
                "priority": topic["priority"],
                "minutes": study_minutes,
                "mastery_before": topic["mastery"],
            })
            day_plan["total_study_minutes"] += study_minutes
            remaining_minutes -= study_minutes

            remaining_by_id[tid] = max(0, remaining_for_topic - study_minutes)

            # Schedule first review after first exposure (even if it spans days)
            if remaining_for_topic == remaining_by_id[tid] + study_minutes:
                interval = compute_review_interval(1, topic["mastery"])
                if day + interval <= total_days:
                    review_queue.append({
                        "topic_id": tid,
                        "topic_name": topic["name"],
                        "review_number": 1,
                        "retention": max(topic["mastery"], 0.3),
                        "day_due": day + interval,
                    })

            if remaining_by_id[tid] <= 0:
                topic_idx += 1

        schedule.append(day_plan)

        # If we were asked to compute days, extend horizon until topics are finished.
        if computed_days and topic_idx < len(ordered_topics) and day == total_days:
            total_days += 1

        day += 1

    # Summary statistics
    total_study = sum(d["total_study_minutes"] for d in schedule)
    total_review = sum(d["total_review_minutes"] for d in schedule)
    topics_covered = sum(1 for tid, rem in remaining_by_id.items() if rem <= 0)

    return {
        "plan": schedule,
        "summary": {
            "total_days": total_days,
            "daily_hours": daily_hours,
            "total_study_hours": round(total_study / 60, 1),
            "total_review_hours": round(total_review / 60, 1),
            "topics_to_study": len(ordered_topics),
            "topics_covered": topics_covered,
            "topics_remaining": len(ordered_topics) - topics_covered,
        },
        "prioritized_topics": ordered_topics,
    }


def compute_review_interval(review_number, retention_score):
    """
    Module 5: SM-2 variant for spaced repetition intervals.

    Formula: interval = base_interval × (retention_score + 0.5) × multiplier

    Review 1: ~1-2 days
    Review 2: ~3-4 days
    Review 3: ~7 days
    Review 4+: ~14+ days

    All deterministic — based purely on review count and retention.
    """
    base_intervals = {1: 1, 2: 3, 3: 7, 4: 14}
    base = base_intervals.get(review_number, 14)

    # Retention adjusts the interval (higher retention → longer interval)
    adjusted = base * (retention_score + 0.5)
    return max(1, round(adjusted))


def get_spaced_repetition_schedule(topics_with_mastery, total_days=30):
    """
    Generate a standalone spaced repetition calendar.

    Parameters:
        topics_with_mastery (list): [{ "id", "name", "mastery" }, ...]
        total_days (int): Number of days to plan reviews

    Returns:
        dict: Review calendar with daily review items
    """
    calendar = {day: [] for day in range(1, total_days + 1)}
    review_queue = []

    # Initialize: schedule first review for all topics
    for i, topic in enumerate(topics_with_mastery):
        # Stagger initial reviews across first few days
        start_day = 1 + (i % 3)
        review_queue.append({
            "topic_id": topic["id"],
            "topic_name": topic["name"],
            "review_number": 1,
            "retention": topic.get("mastery", 0.3),
            "day_due": start_day,
        })

    # Process review queue
    while review_queue:
        review = review_queue.pop(0)
        day = review["day_due"]
        if day > total_days:
            continue

        calendar[day].append({
            "topic_id": review["topic_id"],
            "topic_name": review["topic_name"],
            "review_number": review["review_number"],
            "retention": round(review["retention"], 2),
        })

        # Schedule next review
        next_num = review["review_number"] + 1
        new_retention = min(review["retention"] + 0.1, 0.95)
        interval = compute_review_interval(next_num, new_retention)
        next_day = day + interval

        if next_day <= total_days and next_num <= 6:  # cap at 6 reviews
            review_queue.append({
                "topic_id": review["topic_id"],
                "topic_name": review["topic_name"],
                "review_number": next_num,
                "retention": new_retention,
                "day_due": next_day,
            })

    # Convert to list format
    schedule = []
    for day in range(1, total_days + 1):
        if calendar[day]:
            schedule.append({
                "day": day,
                "reviews": calendar[day],
                "review_count": len(calendar[day]),
            })

    return {
        "schedule": schedule,
        "summary": {
            "total_days": total_days,
            "total_topics": len(topics_with_mastery),
            "total_review_sessions": sum(len(calendar[d]) for d in calendar),
            "active_review_days": len(schedule),
        },
    }
