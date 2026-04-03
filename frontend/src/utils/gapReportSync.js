/**
 * Recompute career gap report after knowledge diagnosis (iterative learning).
 * Aligns with backend/engines/gap_analysis.py thresholds and career_fit formula.
 */

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function fitLabelAndDescription(careerFit) {
  if (careerFit >= 0.85) {
    return {
      career_fit_label: 'Ready',
      career_fit_description: "You're well-prepared for this role!",
    };
  }
  if (careerFit >= 0.65) {
    return {
      career_fit_label: 'Almost There',
      career_fit_description: "A few more skills and you're ready.",
    };
  }
  if (careerFit >= 0.4) {
    return {
      career_fit_label: 'Making Progress',
      career_fit_description: 'You have a solid foundation to build on.',
    };
  }
  if (careerFit >= 0.2) {
    return {
      career_fit_label: 'Early Stage',
      career_fit_description: "You've started the journey — keep going!",
    };
  }
  return {
    career_fit_label: 'Getting Started',
    career_fit_description: 'A great time to start learning!',
  };
}

/**
 * @param {object} gapReport - prior report from /api/analyze-gap
 * @param {object} diagnosis - from /api/diagnose or complete-day (must include skill_readiness)
 */
export function recomputeGapReportAfterDiagnosis(gapReport, diagnosis) {
  if (!gapReport || !diagnosis?.skill_readiness?.length) {
    return gapReport;
  }

  const readinessById = {};
  diagnosis.skill_readiness.forEach((s) => {
    readinessById[s.id] = round4(s.readiness);
  });

  const byId = new Map();
  for (const s of gapReport.skills.missing) {
    byId.set(s.id, { ...s });
  }
  for (const s of gapReport.skills.partial) {
    byId.set(s.id, { ...s });
  }
  for (const s of gapReport.skills.mastered || []) {
    byId.set(s.id, { ...s });
  }

  byId.forEach((skill, id) => {
    if (readinessById[id] !== undefined) {
      skill.proficiency = readinessById[id];
    }
  });

  const all = Array.from(byId.values());

  const missing = [];
  const partial = [];
  const mastered = [];
  for (const s of all) {
    const p = s.proficiency;
    if (p <= 0) missing.push(s);
    else if (p < 0.6) partial.push(s);
    else mastered.push(s);
  }

  const sortDesc = (a, b) => b.weight - a.weight;
  missing.sort(sortDesc);
  partial.sort(sortDesc);
  mastered.sort(sortDesc);

  let totalWeight = 0;
  let weightedScore = 0;
  for (const s of all) {
    totalWeight += s.weight;
    weightedScore += s.weight * s.proficiency;
  }
  const career_fit = totalWeight > 0 ? round4(weightedScore / totalWeight) : 0;

  const categories = {};
  for (const s of all) {
    const cat = s.category;
    if (!categories[cat]) categories[cat] = { total_weight: 0, achieved_score: 0 };
    categories[cat].total_weight += s.weight;
    categories[cat].achieved_score += s.weight * s.proficiency;
  }
  const category_scores = {};
  for (const [cat, vals] of Object.entries(categories)) {
    category_scores[cat] = vals.total_weight > 0
      ? round4(vals.achieved_score / vals.total_weight)
      : 0;
  }

  const { career_fit_label, career_fit_description } = fitLabelAndDescription(career_fit);

  return {
    ...gapReport,
    career_fit,
    career_fit_percent: Math.round(career_fit * 1000) / 10,
    career_fit_label,
    career_fit_description,
    summary: {
      total_skills: all.length,
      mastered: mastered.length,
      partial: partial.length,
      missing: missing.length,
    },
    skills: { missing, partial, mastered },
    category_scores,
  };
}
