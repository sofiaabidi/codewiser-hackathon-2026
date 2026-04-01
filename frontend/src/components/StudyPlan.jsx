import { useState, useEffect } from 'react';
import { generateStudyPlan, generateSpacedRepetition } from '../utils/api';

export default function StudyPlan({ studyData, onBack, onStartOver }) {
  const [plan, setPlan] = useState(null);
  const [repetition, setRepetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('plan');
  const [expandedDay, setExpandedDay] = useState(1);
  const [dailyHours, setDailyHours] = useState(4);
  const [totalDays, setTotalDays] = useState(14);

  const { allGaps, masteryScores, careerWeights } = studyData;

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

  const handleRegenerate = () => {
    fetchPlan();
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
          <div className="card-value">{plan.summary.topics_covered}/{plan.summary.topics_to_study}</div>
          <div className="card-label">Topics</div>
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
              {plan.plan.map(day => (
                <div
                  key={day.day}
                  className={`heatmap-cell ${getDayIntensity(day)} ${expandedDay === day.day ? 'selected' : ''}`}
                  onClick={() => setExpandedDay(day.day)}
                  title={`Day ${day.day}: ${formatMinutes(day.total_study_minutes + day.total_review_minutes)}`}
                >
                  {day.day}
                </div>
              ))}
            </div>
            <div className="heatmap-legend">
              <span className="legend-item"><span className="heatmap-cell-mini empty" /> Rest</span>
              <span className="legend-item"><span className="heatmap-cell-mini low" /> Light</span>
              <span className="legend-item"><span className="heatmap-cell-mini mid" /> Medium</span>
              <span className="legend-item"><span className="heatmap-cell-mini high" /> Intense</span>
            </div>
          </div>

          {/* Day detail */}
          {expandedDay && (
            <div className="day-detail animate-fade-in-up">
              {(() => {
                const day = plan.plan.find(d => d.day === expandedDay);
                if (!day) return null;
                const hasContent = day.topics.length > 0 || day.reviews.length > 0;
                return (
                  <>
                    <div className="day-detail-header">
                      <h3>Day {day.day}</h3>
                      <span className="day-total">
                        {formatMinutes(day.total_study_minutes + day.total_review_minutes)} total
                      </span>
                    </div>
                    {!hasContent && (
                      <p className="day-empty">No sessions scheduled for this day. Rest or catch up!</p>
                    )}
                    {day.topics.length > 0 && (
                      <div className="day-section">
                        <h4>📖 Study Sessions</h4>
                        {day.topics.map((topic, i) => (
                          <div key={i} className="schedule-item study">
                            <div className="schedule-item-left">
                              <span className="schedule-dot study" />
                              <div>
                                <div className="schedule-name">{topic.topic_name}</div>
                                <span className="skill-category-badge">{topic.category}</span>
                              </div>
                            </div>
                            <div className="schedule-item-right">
                              <span className="schedule-duration">{formatMinutes(topic.minutes)}</span>
                              <span className="schedule-priority">
                                priority: {topic.priority.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {day.reviews.length > 0 && (
                      <div className="day-section">
                        <h4>🔁 Review Sessions</h4>
                        {day.reviews.map((review, i) => (
                          <div key={i} className="schedule-item review">
                            <div className="schedule-item-left">
                              <span className="schedule-dot review" />
                              <div>
                                <div className="schedule-name">{review.topic_name}</div>
                                <span className="skill-category-badge">Review #{review.review_number}</span>
                              </div>
                            </div>
                            <div className="schedule-item-right">
                              <span className="schedule-duration">{formatMinutes(review.minutes)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Priority Topics Tab */}
      {activeTab === 'topics' && (
        <div className="priority-view animate-fade-in">
          <div className="priority-list">
            {plan.prioritized_topics.map((topic, i) => (
              <div key={topic.id} className="priority-item">
                <div className="priority-rank">#{i + 1}</div>
                <div className="priority-info">
                  <div className="priority-name">{topic.name}</div>
                  <div className="priority-meta">
                    <span className="skill-category-badge">{topic.category}</span>
                    <span className="priority-stat">Difficulty: {Math.round(topic.difficulty * 100)}%</span>
                    <span className="priority-stat">Mastery: {Math.round(topic.mastery * 100)}%</span>
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
            ))}
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
