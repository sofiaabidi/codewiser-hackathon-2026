# PathForge: Features and Formulas

PathForge is a deterministic career learning system (no LLM dependency in core logic).  
It combines skill-gap analysis, prerequisite graph diagnosis, study planning, spaced repetition, and iterative mastery updates.

---

## Core Features


1. **Career Skill Gap Analysis**
   - Select a target role.
   - Rate current skill proficiency (`0.0` to `1.0`).
   - Get weighted career-fit score, readiness label, and categorized gaps.

2. **Knowledge Dependency Graph Diagnosis**
   - Expands selected skill targets into full prerequisite DAG.
   - Detects weak concepts and root gaps (foundational blockers).
   - Computes per-skill readiness from prerequisite mastery.

3. **Priority-Based Study Optimization**
   - Scores each gap by urgency/importance using difficulty, mastery, and role weight.
   - Produces ranked learning priorities.

4. **Day-by-Day Study Plan Generation**
   - Respects prerequisite order (topological sorting).
   - Packs topics into daily time budget.
   - Splits large topics across multiple days when needed.

5. **Spaced Repetition Scheduling**
   - SM-2-inspired interval logic.
   - Automatically queues future review sessions with retention updates.

6. **Iterative Mastery Updates**
   - Updates mastery after study and review completion.
   - Recomputes remaining gaps and regenerates plan.

7. **Auth + Session Persistence**
   - Google/GitHub OAuth login.
   - Save and resume study sessions by user.

---

## Formulas and Rules

## 1) Career Fit (Gap Analysis)

For a target role with required skills:

```text
career_fit = Σ(weight_i * proficiency_i) / Σ(weight_i)
career_fit_percent = career_fit * 100
```

- Missing skills default to proficiency `0.0`.
- Skill classification threshold:
  - `missing`: proficiency `<= 0.0`
  - `partial`: `0.0 < proficiency < 0.6`
  - `mastered`: proficiency `>= 0.6`

Readiness labels:
- `>= 0.85` -> Ready
- `>= 0.65` -> Almost There
- `>= 0.40` -> Making Progress
- `>= 0.20` -> Early Stage
- else -> Getting Started

Category score (for skill category radar):

```text
category_score = Σ(weight_i * proficiency_i in category) / Σ(weight_i in category)
```

---

## 2) Knowledge Gap Diagnosis (DAG)

- Subgraph expansion uses BFS over prerequisites.
- Concept gap rule:

```text
is_gap = (mastery < 0.6)
```

- Root gap rule:
  - concept is a gap, and
  - all its prerequisites inside the analyzed subgraph have mastery `>= 0.6`
  - (or it has no prerequisites in subgraph)

Skill readiness:

```text
if skill has no prerequisites:
    readiness = mastery(skill)
else:
    readiness = average(mastery(prereq_j))
```

---

## 3) Priority Score (Study Optimizer)

Per gap topic:

```text
priority = difficulty * (1 - mastery) * career_importance
```

- `career_importance` comes from role skill weights.
- If a concept is not directly mapped in role weights, default `career_importance = 0.3`.

---

## 4) Time Allocation and Scheduling

Required study minutes per topic:

```text
required_minutes = max(int(estimated_hours * 60 * (1 - mastery)), 30)
```

Daily constraints:
- Daily budget: `daily_hours * 60`
- Minimum session: `30` min
- Per-topic daily cap: `120` min
- Reviews are allocated first, then study topics.

Ordering:
1. Topological sort (Kahn/BFS) for prerequisite consistency.
2. Follow topo order and include remaining prioritized topics.
3. Greedy fill into each day budget.

---

## 5) Spaced Repetition Interval

Base intervals:

```text
review #1 -> 1 day
review #2 -> 3 days
review #3 -> 7 days
review #4+ -> 14 days
```

Interval formula:

```text
interval_days = max(1, round(base_interval * (retention_score + 0.5)))
```

Standalone review scheduling:
- Initial reviews are staggered across days `1..3`.
- Retention update per completed review:

```text
new_retention = min(old_retention + 0.1, 0.95)
```

- Max reviews per topic in standalone scheduler: `6`.

---

## 6) Mastery Update After Completing a Day

Constants:
- `STUDY_FACTOR = 0.3`
- `MAX_MASTERY = 0.95`

Study-completion update:

```text
time_factor = min(actual_minutes / max(expected_minutes, 1), 1.0)
gain_study = (1 - old_mastery) * STUDY_FACTOR * time_factor
new_mastery = min(old_mastery + gain_study, MAX_MASTERY)
```

Review-completion update (as implemented in code):

```text
gain_review = 0.05 * (1 / review_number)   # defaults to 0.05 when review_number <= 0
new_mastery = min(old_mastery + gain_review, MAX_MASTERY)
```

Remaining gap filter:

```text
keep_gap if updated_mastery(gap_id) < 0.6
```

---

## API Capability Summary

- Auth:
  - `GET /api/auth/login/google`
  - `GET /api/auth/callback/google`
  - `GET /api/auth/login/github`
  - `GET /api/auth/callback/github`
  - `GET /api/auth/me`
  - `POST /api/auth/logout`
- Learning flow:
  - `GET /api/roles`
  - `GET /api/roles/<role_id>/skills`
  - `POST /api/analyze-gap`
  - `POST /api/knowledge-graph`
  - `POST /api/diagnose`
  - `POST /api/study-plan`
  - `POST /api/spaced-repetition`
  - `POST /api/complete-day`
- Persistence:
  - `GET /api/sessions`
  - `GET /api/sessions/<session_id>`
  - `POST /api/sessions/save`
  - `DELETE /api/sessions/<session_id>`

