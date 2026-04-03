"""
PathForge — Mastery Update Engine
Deterministic mastery score updates when users complete study sessions.
No LLMs. Pure algorithmic intelligence.
"""


def compute_mastery_updates(completed_topics, completed_reviews, current_mastery):
    """
    Compute updated mastery scores after a user completes a day of study.

    Study completion formula:
        new_mastery = old + (1 - old) × study_factor × time_factor
        - study_factor = 0.3 (base gain per completed session)
        - time_factor = min(actual_minutes / expected_minutes, 1.0)
        - Capped at 0.95 — full mastery requires review cycles

    Review completion formula:
        new_mastery = min(old + 0.05 × review_number, 0.95)
        - Each review solidifies retention by a small fixed increment

    Parameters:
        completed_topics (list): [{"topic_id": str, "minutes_spent": int, "expected_minutes": int}]
        completed_reviews (list): [{"topic_id": str, "review_number": int}]
        current_mastery (dict): { concept_id: 0.0-1.0, ... }

    Returns:
        dict: {
            "updated_mastery": { concept_id: new_value, ... },
            "changes": [{ "id", "name", "before", "after", "delta", "source" }]
        }
    """
    STUDY_FACTOR = 0.3
    MAX_MASTERY = 0.95

    updated = dict(current_mastery)
    changes = []

    # Process completed study topics
    for topic in completed_topics:
        tid = topic["topic_id"]
        old_mastery = updated.get(tid, 0.0)

        actual_min = topic.get("minutes_spent", 30)
        expected_min = topic.get("expected_minutes", 60)
        time_factor = min(actual_min / max(expected_min, 1), 1.0)

        # Diminishing returns formula: harder to improve as mastery grows
        gain = (1.0 - old_mastery) * STUDY_FACTOR * time_factor
        new_mastery = min(old_mastery + gain, MAX_MASTERY)
        new_mastery = round(new_mastery, 4)

        if new_mastery != old_mastery:
            updated[tid] = new_mastery
            changes.append({
                "id": tid,
                "name": topic.get("topic_name", tid),
                "before": round(old_mastery, 4),
                "after": new_mastery,
                "delta": round(new_mastery - old_mastery, 4),
                "source": "study",
            })

    # Process completed reviews
    for review in completed_reviews:
        tid = review["topic_id"]
        old_mastery = updated.get(tid, 0.0)
        review_num = review.get("review_number", 1)

        # Fixed increment, scaled by review number (later reviews = smaller boost)
        gain = 0.05 * (1.0 / review_num) if review_num > 0 else 0.05
        new_mastery = min(old_mastery + gain, MAX_MASTERY)
        new_mastery = round(new_mastery, 4)

        if new_mastery != old_mastery:
            updated[tid] = new_mastery
            changes.append({
                "id": tid,
                "name": review.get("topic_name", tid),
                "before": round(old_mastery, 4),
                "after": new_mastery,
                "delta": round(new_mastery - old_mastery, 4),
                "source": "review",
            })

    return {
        "updated_mastery": updated,
        "changes": changes,
    }


def filter_remaining_gaps(all_gaps, updated_mastery, threshold=0.6):
    """
    Filter out gaps that are now mastered (above threshold) after updates.

    Parameters:
        all_gaps (list): Original gap concept dicts
        updated_mastery (dict): Updated mastery scores
        threshold (float): Mastery threshold for "mastered" status

    Returns:
        list: Filtered gaps that still need work
    """
    remaining = []
    for gap in all_gaps:
        gid = gap["id"]
        mastery = updated_mastery.get(gid, gap.get("mastery", 0.0))
        if mastery < threshold:
            # Update the mastery value in the gap object
            updated_gap = dict(gap)
            updated_gap["mastery"] = mastery
            remaining.append(updated_gap)
    return remaining
