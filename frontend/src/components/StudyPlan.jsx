import { useState, useEffect } from 'react';
import { generateStudyPlan, generateSpacedRepetition, completeDay } from '../utils/api';
import { recomputeGapReportAfterDiagnosis } from '../utils/gapReportSync';
import topicResources from '../data/topicResources.json';
import UiIcon from './UiIcon';

export default function StudyPlan({
  studyData,
  gapReport,
  onBack,
  onStartOver,
  onUpdateGapReport,
  onUpdateStudyData,
  onViewGapReport,
}) {
  const savedStudyPlan = studyData?.studyPlan ?? null;
  const savedSpacedRepetition = studyData?.spacedRepetition ?? null;
  const savedStudySettings = studyData?.studySettings ?? {};
  const savedCompletedDays = Array.isArray(studyData?.completedDays) ? studyData.completedDays.map((d) => Number(d)) : [];

  const [plan, setPlan] = useState(savedStudyPlan);
  const [repetition, setRepetition] = useState(savedSpacedRepetition);
  const [loading, setLoading] = useState(!(savedStudyPlan && savedSpacedRepetition));
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('plan');
  const [expandedDay, setExpandedDay] = useState(1);
  const [dailyHours, setDailyHours] = useState(savedStudySettings?.dailyHours ?? 4);

  // Iterative learning state
  const [completedDays, setCompletedDays] = useState(() => new Set(savedCompletedDays));
  const [checkedTopics, setCheckedTopics] = useState(new Set());
  const [checkedReviews, setCheckedReviews] = useState(new Set());
  const [completing, setCompleting] = useState(false);
  const [masteryChanges, setMasteryChanges] = useState(null);
  const [currentMastery, setCurrentMastery] = useState({});
  const [currentGaps, setCurrentGaps] = useState([]);

  const [openResourcesFor, setOpenResourcesFor] = useState(new Set());
  const effectiveTotalDays = plan?.summary?.total_days || savedStudyPlan?.summary?.total_days || 0;

  const toggleResourcesPanel = (key) => {
    setOpenResourcesFor(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getTopicResources = (topicId) => topicResources?.[topicId] || [];

  const computeAdaptiveTotalDays = (gapsPayload, masteryMap, hoursPerDay) => {
    const safeHours = Math.max(1, Number(hoursPerDay) || 1);
    const remainingHours = gapsPayload.reduce((sum, g) => {
      const mastery = masteryMap[g.id] ?? g.mastery ?? 0;
      const deficit = Math.max(0, 1 - mastery);
      return sum + (g.estimated_hours || 1) * deficit;
    }, 0);

    // Add a small review/overhead buffer so plans are realistic.
    const bufferedHours = remainingHours * 1.2;
    return Math.max(1, Math.ceil(bufferedHours / safeHours));
  };

  const aggregateTopics = (topics = []) => {
    const byId = new Map();
    topics.forEach((t) => {
      const existing = byId.get(t.topic_id);
      if (!existing) {
        byId.set(t.topic_id, { ...t });
        return;
      }
      existing.minutes += t.minutes;
    });
    return Array.from(byId.values());
  };

  const aggregateReviews = (reviews = []) => {
    const byKey = new Map();
    reviews.forEach((r) => {
      const key = `${r.topic_id}::${r.review_number}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...r });
        return;
      }
      existing.minutes += r.minutes;
    });
    return Array.from(byKey.values());
  };

  const getLinkDomain = (url) => {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const guessResourceKind = (r) => {
    if (r?.kind) return r.kind;
    const url = (r?.url || '').toLowerCase();
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'Video';
    return 'Website';
  };

  const { allGaps, masteryScores, careerWeights } = studyData;

  // Initialize mastery state from props
  useEffect(() => {
    setCurrentMastery({ ...masteryScores });
    setCurrentGaps([...allGaps]);
  }, []);

  useEffect(() => {
    if (savedStudyPlan && savedSpacedRepetition) {
      setLoading(false);
      return;
    }
    fetchPlan();
  }, []);

  const fetchPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const gapsPayload = allGaps.map(g => ({
        id: g.id,
        name: g.name,
        category: g.category,
        difficulty: g.difficulty,
        estimated_hours: g.estimated_hours,
        mastery: g.mastery,
        is_root_gap: g.is_root_gap || false,
      }));

      const adaptiveDays = computeAdaptiveTotalDays(gapsPayload, masteryScores, dailyHours);
      const planResult = await generateStudyPlan(gapsPayload, masteryScores, careerWeights, dailyHours, adaptiveDays);
      const repResult = await generateSpacedRepetition(
        gapsPayload.map(g => ({ id: g.id, name: g.name, mastery: g.mastery })),
        Math.max(1, planResult?.summary?.total_days || adaptiveDays)
      );

      setPlan(planResult);
      setRepetition(repResult);

      // Persist generated schedule so user can resume without regenerating.
      if (onUpdateStudyData) {
        onUpdateStudyData({
          studyPlan: planResult,
          spacedRepetition: repResult,
          studySettings: { dailyHours },
          completedDays: Array.from(completedDays),
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const gapsPayload = currentGaps.map(g => ({
        id: g.id,
        name: g.name,
        category: g.category,
        difficulty: g.difficulty,
        estimated_hours: g.estimated_hours,
        mastery: currentMastery[g.id] || g.mastery || 0,
        is_root_gap: g.is_root_gap || false,
      }));

      const adaptiveDays = computeAdaptiveTotalDays(gapsPayload, currentMastery, dailyHours);
      const planResult = await generateStudyPlan(gapsPayload, currentMastery, careerWeights, dailyHours, adaptiveDays);
      const repResult = await generateSpacedRepetition(
        gapsPayload.map(g => ({ id: g.id, name: g.name, mastery: currentMastery[g.id] || g.mastery || 0 })),
        Math.max(1, planResult?.summary?.total_days || adaptiveDays)
      );

      setPlan(planResult);
      setRepetition(repResult);
      setCompletedDays(new Set());
      setCheckedTopics(new Set());
      setCheckedReviews(new Set());
      setExpandedDay(1);

      if (onUpdateStudyData) {
        onUpdateStudyData({
          studyPlan: planResult,
          spacedRepetition: repResult,
          studySettings: { dailyHours },
          completedDays: [],
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Toggle a topic checkbox
  const toggleTopic = (dayNum, topicId) => {
    const key = `${dayNum}-${topicId}`;
    setCheckedTopics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Toggle a review checkbox
  const toggleReview = (dayNum, topicId, reviewNum) => {
    const key = `${dayNum}-${topicId}-r${reviewNum}`;
    setCheckedReviews(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Get skill_ids from gap report
  const getSkillIds = () => {
    if (!gapReport) return [];
    // Include ALL role skills so `diagnosis.skill_readiness` refreshes across the full
    // weighted career-fit calculation (missing/partial/mastered).
    return [
      ...(gapReport.skills.missing || []).map(s => s.id),
      ...(gapReport.skills.partial || []).map(s => s.id),
      ...(gapReport.skills.mastered || []).map(s => s.id),
    ];
  };

  // Complete a day
  const handleCompleteDay = async (dayNum) => {
    const day = plan.plan.find(d => d.day === dayNum);
    if (!day) return;

    let nextStudyPlan = null;
    let nextSpacedRepetition = null;

    // Build completed topics
    const completedTopicsList = aggregateTopics(day.topics)
      .filter(t => checkedTopics.has(`${dayNum}-${t.topic_id}`))
      .map(t => ({
        topic_id: t.topic_id,
        topic_name: t.topic_name,
        minutes_spent: t.minutes,
        expected_minutes: t.minutes,
      }));

    // Build completed reviews
    const completedReviewsList = aggregateReviews(day.reviews)
      .filter(r => checkedReviews.has(`${dayNum}-${r.topic_id}-r${r.review_number}`))
      .map(r => ({
        topic_id: r.topic_id,
        topic_name: r.topic_name,
        review_number: r.review_number,
      }));

    if (completedTopicsList.length === 0 && completedReviewsList.length === 0) return;

    setCompleting(true);
    setMasteryChanges(null);

    try {
      // Build remaining gaps payload
      const gapsPayload = currentGaps.map(g => ({
        id: g.id,
        name: g.name,
        category: g.category,
        difficulty: g.difficulty,
        estimated_hours: g.estimated_hours,
        mastery: currentMastery[g.id] || g.mastery || 0,
        is_root_gap: g.is_root_gap || false,
      }));

      const remainingDays = Math.max(0, effectiveTotalDays - dayNum);

      const result = await completeDay({
        completed_topics: completedTopicsList,
        completed_reviews: completedReviewsList,
        current_mastery: currentMastery,
        skill_ids: getSkillIds(),
        career_weights: careerWeights,
        remaining_gaps: gapsPayload,
        daily_hours: dailyHours,
        remaining_days: remainingDays,
      });

      // Update local mastery state
      setCurrentMastery(result.updated_mastery);

      // Show mastery changes
      if (result.mastery_changes && result.mastery_changes.length > 0) {
        setMasteryChanges(result.mastery_changes);
      }

      // Update remaining gaps — annotate with is_root_gap flag
      if (result.diagnosis) {
        const rootGapIds = new Set(result.diagnosis.root_gaps.map(g => g.id));
        const newGaps = [
          ...result.diagnosis.root_gaps.map(g => ({ ...g, is_root_gap: true })),
          ...result.diagnosis.other_gaps.map(g => ({ ...g, is_root_gap: rootGapIds.has(g.id) })),
        ];
        setCurrentGaps(newGaps);
      }

      // Mark day as completed
      const nextCompletedDays = new Set(completedDays);
      nextCompletedDays.add(dayNum);
      setCompletedDays(nextCompletedDays);

      const totalDays = effectiveTotalDays + (result.auto_extended_days || 0);

      // Regenerate plan for remaining days if we got a new plan
      if (result.study_plan && result.study_plan.plan) {
        // Merge: keep completed days from old plan, append new plan for remaining days
        const completedDayPlans = plan.plan.filter(d => d.day <= dayNum);
        const newDayPlans = result.study_plan.plan.map((d, i) => ({
          ...d,
          day: dayNum + i + 1,
        }));
        // Fill remaining slots
        const mergedPlan = [...completedDayPlans];
        for (const nd of newDayPlans) {
          if (nd.day <= totalDays) {
            mergedPlan.push(nd);
          }
        }
        // Fill any empty days — use actual max day number, not array length
        const maxDayInPlan = mergedPlan.reduce((max, d) => Math.max(max, d.day), 0);
        for (let d = maxDayInPlan + 1; d <= totalDays; d++) {
          mergedPlan.push({
            day: d,
            topics: [],
            reviews: [],
            total_study_minutes: 0,
            total_review_minutes: 0,
          });
        }
        const mergedPrioritized = result.study_plan.prioritized_topics || plan.prioritized_topics;
        nextStudyPlan = {
          ...plan,
          plan: mergedPlan.sort((a, b) => a.day - b.day),
          prioritized_topics: mergedPrioritized,
          summary: {
            ...plan.summary,
            ...result.study_plan.summary,
            total_days: totalDays,
            topics_remaining: result.study_plan.summary.topics_remaining,
          },
        };
        setPlan(nextStudyPlan);
      }

      // Career gap report: recompute each day so career fit + stats change with progress.
      // Prefer backend `diagnosis.skill_readiness` (prereq-based readiness), but fall back to
      // updated mastery or existing proficiency if readiness isn't available for a skill id.
      if (onUpdateGapReport && gapReport) {
        const existingSkills = [
          ...(gapReport.skills?.missing || []),
          ...(gapReport.skills?.partial || []),
          ...(gapReport.skills?.mastered || []),
        ];

        const diagnosisReadinessById = {};
        (result.diagnosis?.skill_readiness || []).forEach((s) => {
          diagnosisReadinessById[s.id] = s.readiness;
        });

        const normalizedReadiness = existingSkills.map((skill) => {
          const fromMastery = result.updated_mastery?.[skill.id];
          const fromExisting = skill.proficiency ?? 0;
          const fromDiagnosis = diagnosisReadinessById[skill.id];

          // Important: use diagnosis readiness as the primary proficiency signal.
          // Raw mastery for the role-skill concept may not change unless that concept itself is studied.
          const readiness =
            typeof fromDiagnosis === 'number'
              ? fromDiagnosis
              : (typeof fromMastery === 'number' ? fromMastery : fromExisting);
          return {
            id: skill.id,
            readiness: Math.max(0, Math.min(1, readiness)),
          };
        });

        const updatedReport = recomputeGapReportAfterDiagnosis(gapReport, {
          ...(result.diagnosis || {}),
          skill_readiness: normalizedReadiness,
        });
        if (updatedReport) onUpdateGapReport(updatedReport);
      }

      // Refresh spaced repetition from current gaps + mastery (matches regenerated priorities)
      try {
        const baseGaps = result.diagnosis
          ? [
              ...result.diagnosis.root_gaps.map(g => ({ ...g, is_root_gap: true })),
              ...result.diagnosis.other_gaps.map(g => ({ ...g, is_root_gap: false })),
            ]
          : gapsPayload;
        const gapsForRep = baseGaps.map(g => ({
          id: g.id,
          name: g.name,
          mastery: result.updated_mastery[g.id] ?? g.mastery ?? 0,
        }));
        if (gapsForRep.length > 0) {
          const repResult = await generateSpacedRepetition(gapsForRep, totalDays);
          nextSpacedRepetition = repResult;
          setRepetition(repResult);
        }
      } catch {
        // optional; schedule tab may stay on prior run
      }

      // Propagate updated mastery and gaps back to parent so KnowledgeGraph stays in sync
      if (onUpdateStudyData) {
        onUpdateStudyData({
          masteryScores: result.updated_mastery,
          allGaps: result.diagnosis
            ? [
                ...result.diagnosis.root_gaps.map(g => ({ ...g, is_root_gap: true })),
                ...result.diagnosis.other_gaps.map(g => ({ ...g, is_root_gap: false })),
              ]
            : currentGaps,
          completedDays: Array.from(nextCompletedDays),
          studyPlan: nextStudyPlan || plan,
          spacedRepetition: nextSpacedRepetition || repetition,
          studySettings: { dailyHours },
        });
      }

      // Auto-advance to next day
      const nextDay = dayNum + 1;
      if (nextDay <= totalDays) {
        setTimeout(() => setExpandedDay(nextDay), 800);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setCompleting(false);
    }
  };

  const getDayIntensity = (day) => {
    const total = day.total_study_minutes + day.total_review_minutes;
    if (total >= 180) return 'high';
    if (total >= 90) return 'mid';
    if (total > 0) return 'low';
    return 'empty';
  };

  const formatMinutes = (mins) => {
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins}m`;
  };

  // How many items are checked for a given day?
  const getCheckedCount = (dayNum) => {
    let count = 0;
    for (const key of checkedTopics) {
      if (key.startsWith(`${dayNum}-`)) count++;
    }
    for (const key of checkedReviews) {
      if (key.startsWith(`${dayNum}-`)) count++;
    }
    return count;
  };

  // Total items for a day
  const getDayItemCount = (day) => aggregateTopics(day.topics).length + aggregateReviews(day.reviews).length;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <span className="loading-text">Generating optimized study plan…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="study-plan-page">
      <div className="study-plan-nav">
        <button className="back-btn" type="button" onClick={onBack}>← Back to Graph</button>
        {onViewGapReport && (
        <button className="back-btn gap-report-link" type="button" onClick={onViewGapReport}>
            <UiIcon name="chart" size={14} className="icon-inline" /> View updated gap report
          </button>
        )}
      </div>

      <div className="section-header">
        <h2>Your Study Plan</h2>
        <p>Complete days to update mastery, refresh gaps, and regenerate the rest of your schedule. Open the gap report or knowledge graph anytime to see progress.</p>
      </div>

      {/* Mastery update toast */}
      {masteryChanges && masteryChanges.length > 0 && (
        <div className="mastery-toast animate-fade-in-up" id="mastery-toast">
          <div className="mastery-toast-header">
            <span className="mastery-toast-icon"><UiIcon name="target" size={16} className="icon-inline" /></span>
            <span className="mastery-toast-title">Mastery Updated!</span>
            <button className="mastery-toast-close" onClick={() => setMasteryChanges(null)}>✕</button>
          </div>
          <div className="mastery-toast-body">
            {masteryChanges.map(change => (
              <div key={change.id} className="mastery-change-item">
                <span className="mastery-change-name">{change.name}</span>
                <span className="mastery-change-values">
                  <span className="mastery-before">{Math.round(change.before * 100)}%</span>
                  <span className="mastery-arrow">→</span>
                  <span className="mastery-after">{Math.round(change.after * 100)}%</span>
                </span>
                <span className="mastery-delta">+{Math.round(change.delta * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan summary */}
      <div className="summary-cards stagger-children">
        <div className="summary-card total">
          <div className="card-value">{plan.summary.total_days}</div>
          <div className="card-label">Days</div>
        </div>
        <div className="summary-card mastered">
          <div className="card-value">{plan.summary.total_study_hours}</div>
          <div className="card-label">Study Hours</div>
        </div>
        <div className="summary-card partial">
          <div className="card-value">{plan.summary.total_review_hours}</div>
          <div className="card-label">Review Hours</div>
        </div>
        <div className="summary-card missing">
          <div className="card-value">{completedDays.size}/{plan.summary.total_days}</div>
          <div className="card-label">Days Done</div>
        </div>
      </div>

      {/* Settings */}
      <div className="plan-settings animate-fade-in">
        <div className="setting-group">
          <label>Daily hours</label>
          <input type="number" min="1" max="12" value={dailyHours}
            onChange={(e) => setDailyHours(parseInt(e.target.value) || 4)} className="setting-input" />
        </div>
        <button className="btn-small" onClick={handleRegenerate}>
          <UiIcon name="refresh" size={14} className="icon-inline" /> Recalculate Plan
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs animate-fade-in">
        <button className={`tab ${activeTab === 'plan' ? 'active' : ''}`} onClick={() => setActiveTab('plan')}>
          <UiIcon name="calendar" size={14} className="icon-inline" /> Daily Schedule
        </button>
        <button className={`tab ${activeTab === 'topics' ? 'active' : ''}`} onClick={() => setActiveTab('topics')}>
          <UiIcon name="chart" size={14} className="icon-inline" /> Priority Topics
        </button>
        <button className={`tab ${activeTab === 'repetition' ? 'active' : ''}`} onClick={() => setActiveTab('repetition')}>
          <UiIcon name="repeat" size={14} className="icon-inline" /> Spaced Repetition
        </button>
      </div>

      {/* Daily Schedule Tab */}
      {activeTab === 'plan' && (
        <div className="schedule-view">
          {/* Calendar heatmap */}
          <div className="calendar-heatmap animate-fade-in">
            <h3>Study Calendar</h3>
            <div className="heatmap-grid">
              {plan.plan.map(day => {
                const isDone = completedDays.has(day.day);
                return (
                  <div
                    key={day.day}
                    className={`heatmap-cell ${getDayIntensity(day)} ${expandedDay === day.day ? 'selected' : ''} ${isDone ? 'completed' : ''}`}
                    onClick={() => setExpandedDay(day.day)}
                    title={`Day ${day.day}: ${isDone ? '✓ Completed' : formatMinutes(day.total_study_minutes + day.total_review_minutes)}`}
                  >
                    {isDone ? '✓' : day.day}
                  </div>
                );
              })}
            </div>
            <div className="heatmap-legend">
              <span className="legend-item"><span className="heatmap-cell-mini empty" /> Rest</span>
              <span className="legend-item"><span className="heatmap-cell-mini low" /> Light</span>
              <span className="legend-item"><span className="heatmap-cell-mini mid" /> Medium</span>
              <span className="legend-item"><span className="heatmap-cell-mini high" /> Intense</span>
              <span className="legend-item"><span className="heatmap-cell-mini done" /> Done</span>
            </div>
          </div>

          {/* Day detail */}
          {expandedDay && (() => {
            const day = plan.plan.find(d => d.day === expandedDay);
            if (!day) return null;
            const isDayDone = completedDays.has(day.day);
            const hasContent = day.topics.length > 0 || day.reviews.length > 0;
            const checkedCount = getCheckedCount(day.day);
            const totalItems = getDayItemCount(day);

            return (
              <div className={`day-detail animate-fade-in-up ${isDayDone ? 'day-completed' : ''}`}>
                <div className="day-detail-header">
                  <div className="day-detail-title-area">
                    <h3>Day {day.day}</h3>
                    {isDayDone && <span className="day-done-badge">✓ Completed</span>}
                  </div>
                  <span className="day-total">
                    {formatMinutes(day.total_study_minutes + day.total_review_minutes)} total
                  </span>
                </div>

                {!hasContent && (
                  <p className="day-empty">No sessions scheduled for this day. Rest or catch up!</p>
                )}

                {/* Study sessions */}
                {aggregateTopics(day.topics).length > 0 && (
                  <div className="day-section">
                    <h4><UiIcon name="book" size={14} className="icon-inline" /> Study Sessions</h4>
                    {aggregateTopics(day.topics).map((topic, i) => {
                      const checkKey = `${day.day}-${topic.topic_id}`;
                      const isChecked = isDayDone || checkedTopics.has(checkKey);
                      const masteryVal = currentMastery[topic.topic_id];

                      const resourcesKey = `${day.day}-${topic.topic_id}`;
                      const isResourcesOpen = openResourcesFor.has(resourcesKey);
                      const resources = getTopicResources(topic.topic_id);
                      return (
                        <div key={i} className="schedule-item-wrap">
                          <div className={`schedule-item study ${isChecked ? 'item-checked' : ''}`}>
                            <div className="schedule-item-left">
                              {!isDayDone ? (
                                <label className="completion-checkbox" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleTopic(day.day, topic.topic_id)}
                                  />
                                  <span className="checkmark" />
                                </label>
                              ) : (
                                <span className="completed-check">✓</span>
                              )}
                              <div>
                                <div className={`schedule-name ${isChecked ? 'name-checked' : ''}`}>
                                  {topic.topic_name}
                                </div>
                                <span className="skill-category-badge">{topic.category}</span>
                                <div className="topic-resources-toggle">
                                  <button
                                    type="button"
                                    className="resources-toggle-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleResourcesPanel(resourcesKey);
                                    }}
                                  >
                                    <UiIcon name="link" size={13} className="icon-inline" /> Resources ({resources.length})
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="schedule-item-right">
                              <span className="schedule-duration">{formatMinutes(topic.minutes)}</span>
                              {masteryVal !== undefined && (
                                <span className="mastery-badge">{Math.round(masteryVal * 100)}%</span>
                              )}
                            </div>
                          </div>

                          {isResourcesOpen && (
                            <div className="topic-resources-panel">
                              <div className="topic-resources-header">
                                <div className="topic-resources-title">Recommended resources</div>
                                <div className="topic-resources-count">{resources.length} links</div>
                              </div>

                              {resources.length === 0 ? (
                                <p className="topic-resources-empty">
                                  No resources found for <span className="mono">{topic.topic_id}</span>.
                                </p>
                              ) : (
                                <div className="topic-resources-grid">
                                  {resources.map((r, idx) => (
                                    <a
                                      key={`${topic.topic_id}-${idx}`}
                                      className="resource-card"
                                      href={r.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <div className="resource-card-top">
                                        <span className="resource-kind">{guessResourceKind(r)}</span>
                                        <span className="resource-domain">{getLinkDomain(r.url)}</span>
                                      </div>
                                      <div className="resource-title">{r.title}</div>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Review sessions */}
                {aggregateReviews(day.reviews).length > 0 && (
                  <div className="day-section">
                    <h4><UiIcon name="repeat" size={14} className="icon-inline" /> Review Sessions</h4>
                    {aggregateReviews(day.reviews).map((review, i) => {
                      const checkKey = `${day.day}-${review.topic_id}-r${review.review_number}`;
                      const isChecked = isDayDone || checkedReviews.has(checkKey);
                      const resourcesKey = `${day.day}-review-${review.topic_id}-r${review.review_number}`;
                      const isResourcesOpen = openResourcesFor.has(resourcesKey);
                      const resources = getTopicResources(review.topic_id);
                      return (
                        <div key={i} className={`schedule-item review ${isChecked ? 'item-checked' : ''}`}>
                          <div className="schedule-item-left">
                            {!isDayDone ? (
                              <label className="completion-checkbox" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleReview(day.day, review.topic_id, review.review_number)}
                                />
                                <span className="checkmark" />
                              </label>
                            ) : (
                              <span className="completed-check">✓</span>
                            )}
                            <div>
                              <div className={`schedule-name ${isChecked ? 'name-checked' : ''}`}>{review.topic_name}</div>
                              <span className="skill-category-badge">Review #{review.review_number}</span>
                              <div className="topic-resources-toggle">
                                <button
                                  type="button"
                                  className="resources-toggle-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleResourcesPanel(resourcesKey);
                                  }}
                                >
                                  <UiIcon name="link" size={13} className="icon-inline" /> Resources ({resources.length})
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="schedule-item-right">
                            <span className="schedule-duration">{formatMinutes(review.minutes)}</span>
                          </div>

                          {isResourcesOpen && (
                            <div className="topic-resources-panel">
                              <div className="topic-resources-header">
                                <div className="topic-resources-title">Recommended resources</div>
                                <div className="topic-resources-count">{resources.length} links</div>
                              </div>

                              {resources.length === 0 ? (
                                <p className="topic-resources-empty">
                                  No resources found for <span className="mono">{review.topic_id}</span>.
                                </p>
                              ) : (
                                <div className="topic-resources-grid">
                                  {resources.map((r, idx) => (
                                    <a
                                      key={`${review.topic_id}-${idx}`}
                                      className="resource-card"
                                      href={r.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <div className="resource-card-top">
                                        <span className="resource-kind">{guessResourceKind(r)}</span>
                                        <span className="resource-domain">{getLinkDomain(r.url)}</span>
                                      </div>
                                      <div className="resource-title">{r.title}</div>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Complete Day button */}
                {!isDayDone && hasContent && (
                  <div className="complete-day-area">
                    <button
                      className="complete-day-btn"
                      onClick={() => handleCompleteDay(day.day)}
                      disabled={completing || checkedCount === 0}
                      id="complete-day-btn"
                    >
                      {completing ? (
                        <>
                          <span className="loading-spinner-sm" />
                          Updating mastery…
                        </>
                      ) : (
                        <>
                          <UiIcon name="check" size={14} className="icon-inline" /> Complete Day {day.day}
                          {checkedCount > 0 && (
                            <span className="checked-count">{checkedCount}/{totalItems}</span>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Priority Topics Tab */}
      {activeTab === 'topics' && (
        <div className="priority-view animate-fade-in">
          <div className="priority-list">
            {plan.prioritized_topics.map((topic, i) => {
              const updatedMastery = currentMastery[topic.id];
              const displayMastery = updatedMastery !== undefined ? updatedMastery : topic.mastery;
              return (
                <div key={topic.id} className="priority-item">
                  <div className="priority-rank">#{i + 1}</div>
                  <div className="priority-info">
                    <div className="priority-name">{topic.name}</div>
                    <div className="priority-meta">
                      <span className="skill-category-badge">{topic.category}</span>
                      <span className="priority-stat">Difficulty: {Math.round(topic.difficulty * 100)}%</span>
                      <span className="priority-stat">Mastery: {Math.round(displayMastery * 100)}%</span>
                      <span className="priority-stat">Est: {topic.estimated_hours}h</span>
                    </div>
                  </div>
                  <div className="priority-score-bar">
                    <div className="priority-bar-track">
                      <div className="priority-bar-fill" style={{ width: `${Math.min(topic.priority * 400, 100)}%` }} />
                    </div>
                    <span className="priority-score">{topic.priority.toFixed(3)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="priority-formula animate-fade-in">
            <h4>Priority Formula</h4>
            <code>priority = difficulty × (1 − mastery) × career_importance</code>
          </div>
        </div>
      )}

      {/* Spaced Repetition Tab */}
      {activeTab === 'repetition' && repetition && (
        <div className="repetition-view animate-fade-in">
          <div className="repetition-summary">
            <div className="summary-card total">
              <div className="card-value">{repetition.summary.total_review_sessions}</div>
              <div className="card-label">Total Reviews</div>
            </div>
            <div className="summary-card mastered">
              <div className="card-value">{repetition.summary.active_review_days}</div>
              <div className="card-label">Active Days</div>
            </div>
          </div>

          <div className="repetition-timeline">
            <h3>Review Timeline</h3>
            {repetition.schedule.map(day => (
              <div key={day.day} className="rep-day">
                <div className="rep-day-header">
                  <span className="rep-day-label">Day {day.day}</span>
                  <span className="rep-day-count">{day.review_count} review{day.review_count > 1 ? 's' : ''}</span>
                </div>
                <div className="rep-day-items">
                  {day.reviews.map((review, i) => (
                    <div key={i} className="rep-item">
                      <span className="rep-topic">{review.topic_name}</span>
                      <span className="rep-info">
                        Review #{review.review_number} • Retention: {Math.round(review.retention * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="repetition-formula animate-fade-in">
            <h4>Spaced Repetition Formula</h4>
            <code>review_interval = base_interval × (retention_score + 0.5)</code>
            <p>Base intervals: 1d → 3d → 7d → 14d (SM-2 variant)</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="report-actions">
        <button className="btn-secondary" onClick={onStartOver}>
          <UiIcon name="refresh" size={14} className="icon-inline" /> Start Over
        </button>
      </div>
    </div>
  );
}
