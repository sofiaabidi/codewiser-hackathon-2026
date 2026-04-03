import { useState, useEffect } from 'react';
import { generateStudyPlan, generateSpacedRepetition, completeDay } from '../utils/api';

export default function StudyPlan({ studyData, gapReport, onBack, onStartOver, onUpdateGapReport, onUpdateStudyData }) {
  const [plan, setPlan] = useState(null);
  const [repetition, setRepetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('plan');
  const [expandedDay, setExpandedDay] = useState(1);
  const [dailyHours, setDailyHours] = useState(4);
  const [totalDays, setTotalDays] = useState(14);

  // Iterative learning state
  const [completedDays, setCompletedDays] = useState(new Set());
  const [checkedTopics, setCheckedTopics] = useState(new Set());
  const [checkedReviews, setCheckedReviews] = useState(new Set());
  const [completing, setCompleting] = useState(false);
  const [masteryChanges, setMasteryChanges] = useState(null);
  const [currentMastery, setCurrentMastery] = useState({});
  const [currentGaps, setCurrentGaps] = useState([]);
  const [updateCount, setUpdateCount] = useState(0);

  const { diagnosis, allGaps, masteryScores, careerWeights } = studyData;

  // Initialize mastery state from props
  useEffect(() => {
    setCurrentMastery({ ...masteryScores });
    setCurrentGaps([...allGaps]);
  }, []);

  useEffect(() => {
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

      const [planResult, repResult] = await Promise.all([
        generateStudyPlan(gapsPayload, masteryScores, careerWeights, dailyHours, totalDays),
        generateSpacedRepetition(
          gapsPayload.map(g => ({ id: g.id, name: g.name, mastery: g.mastery })),
          totalDays
        ),
      ]);

      setPlan(planResult);
      setRepetition(repResult);
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

      const [planResult, repResult] = await Promise.all([
        generateStudyPlan(gapsPayload, currentMastery, careerWeights, dailyHours, totalDays),
        generateSpacedRepetition(
          gapsPayload.map(g => ({ id: g.id, name: g.name, mastery: currentMastery[g.id] || g.mastery || 0 })),
          totalDays
        ),
      ]);

      setPlan(planResult);
      setRepetition(repResult);
      setCompletedDays(new Set());
      setCheckedTopics(new Set());
      setCheckedReviews(new Set());
      setExpandedDay(1);
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
    return [
      ...gapReport.skills.missing.map(s => s.id),
      ...gapReport.skills.partial.map(s => s.id),
    ];
  };

  // Complete a day
  const handleCompleteDay = async (dayNum) => {
    const day = plan.plan.find(d => d.day === dayNum);
    if (!day) return;

    // Build completed topics
    const completedTopicsList = day.topics
      .filter(t => checkedTopics.has(`${dayNum}-${t.topic_id}`))
      .map(t => ({
        topic_id: t.topic_id,
        topic_name: t.topic_name,
        minutes_spent: t.minutes,
        expected_minutes: t.minutes,
      }));

    // Build completed reviews
    const completedReviewsList = day.reviews
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

      const remainingDays = totalDays - dayNum;

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
      setCompletedDays(prev => new Set([...prev, dayNum]));

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
        setPlan({
          ...plan,
          plan: mergedPlan,
          summary: {
            ...plan.summary,
            topics_remaining: result.study_plan.summary.topics_remaining,
          },
        });
      }

      // Update parent gap report state with fresh mastery data
      if (result.diagnosis && onUpdateGapReport && gapReport) {
        const um = result.updated_mastery;
        const recategorize = (skillList) => skillList.map(s => ({
          ...s,
          proficiency: um[s.id] !== undefined ? um[s.id] : s.proficiency,
        }));
        const updatedReport = {
          ...gapReport,
          skills: {
            missing: recategorize(gapReport.skills.missing).filter(s => (um[s.id] ?? s.proficiency) < 0.1),
            partial: recategorize([...gapReport.skills.missing, ...gapReport.skills.partial]).filter(s => {
              const m = um[s.id] ?? s.proficiency;
              return m >= 0.1 && m < 0.6;
            }),
            mastered: recategorize([...gapReport.skills.missing, ...gapReport.skills.partial, ...(gapReport.skills.mastered || [])]).filter(s => {
              const m = um[s.id] ?? s.proficiency;
              return m >= 0.6;
            }),
          },
        };
        onUpdateGapReport(updatedReport);
      }

      setUpdateCount(prev => prev + 1);

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
  const getDayItemCount = (day) => day.topics.length + day.reviews.length;

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
      <button className="back-btn" onClick={onBack}>← Back to Graph</button>

      <div className="section-header">
        <h2>Your Study Plan</h2>
        <p>Priority-optimized with spaced repetition</p>
      </div>

      {/* Mastery update toast */}
      {masteryChanges && masteryChanges.length > 0 && (
        <div className="mastery-toast animate-fade-in-up" id="mastery-toast">
          <div className="mastery-toast-header">
            <span className="mastery-toast-icon">🎯</span>
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
        <div className="setting-group">
          <label>Total days</label>
          <input type="number" min="7" max="90" value={totalDays}
            onChange={(e) => setTotalDays(parseInt(e.target.value) || 14)} className="setting-input" />
        </div>
        <button className="btn-small" onClick={handleRegenerate}>🔄 Regenerate</button>
      </div>

      {/* Tabs */}
      <div className="tabs animate-fade-in">
        <button className={`tab ${activeTab === 'plan' ? 'active' : ''}`} onClick={() => setActiveTab('plan')}>
          📅 Daily Schedule
        </button>
        <button className={`tab ${activeTab === 'topics' ? 'active' : ''}`} onClick={() => setActiveTab('topics')}>
          📊 Priority Topics
        </button>
        <button className={`tab ${activeTab === 'repetition' ? 'active' : ''}`} onClick={() => setActiveTab('repetition')}>
          🔁 Spaced Repetition
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
                {day.topics.length > 0 && (
                  <div className="day-section">
                    <h4>📖 Study Sessions</h4>
                    {day.topics.map((topic, i) => {
                      const checkKey = `${day.day}-${topic.topic_id}`;
                      const isChecked = isDayDone || checkedTopics.has(checkKey);
                      const masteryVal = currentMastery[topic.topic_id];
                      return (
                        <div key={i} className={`schedule-item study ${isChecked ? 'item-checked' : ''}`}>
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
                              <div className={`schedule-name ${isChecked ? 'name-checked' : ''}`}>{topic.topic_name}</div>
                              <span className="skill-category-badge">{topic.category}</span>
                            </div>
                          </div>
                          <div className="schedule-item-right">
                            <span className="schedule-duration">{formatMinutes(topic.minutes)}</span>
                            {masteryVal !== undefined && (
                              <span className="mastery-badge">{Math.round(masteryVal * 100)}%</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Review sessions */}
                {day.reviews.length > 0 && (
                  <div className="day-section">
                    <h4>🔁 Review Sessions</h4>
                    {day.reviews.map((review, i) => {
                      const checkKey = `${day.day}-${review.topic_id}-r${review.review_number}`;
                      const isChecked = isDayDone || checkedReviews.has(checkKey);
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
                            </div>
                          </div>
                          <div className="schedule-item-right">
                            <span className="schedule-duration">{formatMinutes(review.minutes)}</span>
                          </div>
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
                          ✅ Complete Day {day.day}
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
          🔄 Start Over
        </button>
      </div>
    </div>
  );
}
