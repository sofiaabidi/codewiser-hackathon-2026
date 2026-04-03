const API_BASE = 'http://localhost:5000/api';

export async function fetchRoles() {
  const res = await fetch(`${API_BASE}/roles`);
  if (!res.ok) throw new Error('Failed to fetch roles');
  const data = await res.json();
  return data.roles;
}

export async function fetchRoleSkills(roleId) {
  const res = await fetch(`${API_BASE}/roles/${roleId}/skills`);
  if (!res.ok) throw new Error('Failed to fetch role skills');
  return res.json();
}

export async function analyzeGap(roleId, userSkills) {
  const res = await fetch(`${API_BASE}/analyze-gap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role_id: roleId, user_skills: userSkills }),
  });
  if (!res.ok) throw new Error('Failed to analyze gap');
  return res.json();
}

export async function fetchKnowledgeGraph(skillIds) {
  const res = await fetch(`${API_BASE}/knowledge-graph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill_ids: skillIds }),
  });
  if (!res.ok) throw new Error('Failed to fetch knowledge graph');
  return res.json();
}

export async function diagnoseGaps(skillIds, masteryScores) {
  const res = await fetch(`${API_BASE}/diagnose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skill_ids: skillIds, mastery_scores: masteryScores }),
  });
  if (!res.ok) throw new Error('Failed to diagnose gaps');
  return res.json();
}

export async function generateStudyPlan(gaps, masteryScores, careerWeights, dailyHours = 4, totalDays = undefined) {
  const body = {
    gaps,
    mastery_scores: masteryScores,
    career_weights: careerWeights,
    daily_hours: dailyHours,
  };
  if (typeof totalDays === 'number') body.total_days = totalDays;
  const res = await fetch(`${API_BASE}/study-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to generate study plan');
  return res.json();
}

export async function generateSpacedRepetition(topics, totalDays = 30) {
  const res = await fetch(`${API_BASE}/spaced-repetition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topics, total_days: totalDays }),
  });
  if (!res.ok) throw new Error('Failed to generate spaced repetition');
  return res.json();
}

export async function completeDay(payload) {
  const res = await fetch(`${API_BASE}/complete-day`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to complete day');
  return res.json();
}
