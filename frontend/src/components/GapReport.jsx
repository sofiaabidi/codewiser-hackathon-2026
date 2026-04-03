import { useEffect, useState } from 'react';
import UiIcon from './UiIcon';

export default function GapReport({ report, onBack, onStartOver, onExploreGraph, lockSkillEditing = false }) {
  const [gaugeOffset, setGaugeOffset] = useState(283);

  useEffect(() => {
    // Animate the gauge on mount
    const timer = setTimeout(() => {
      const circumference = 283; // 2 * π * 45
      const offset = circumference - (report.career_fit * circumference);
      setGaugeOffset(offset);
    }, 300);
    return () => clearTimeout(timer);
  }, [report.career_fit]);

  const getGaugeColor = (fit) => {
    if (fit >= 0.7) return 'url(#gaugeGradientGreen)';
    if (fit >= 0.4) return 'url(#gaugeGradientAmber)';
    return 'url(#gaugeGradientRed)';
  };

  const getLabelColor = (fit) => {
    if (fit >= 0.7) return 'var(--accent-green)';
    if (fit >= 0.4) return 'var(--accent-amber)';
    return 'var(--accent-red)';
  };

  return (
    <div className="gap-report">
      <button className="back-btn" onClick={onBack}>
        {lockSkillEditing ? '← Back to Graph' : '← Back to Skills'}
      </button>

      <div className="report-header">
        <h2>
          Gap Analysis for <span className="role-name">{report.target_role}</span>
        </h2>
        <p>{report.career_fit_description}</p>
      </div>

      {/* Career Fit Gauge */}
      <div className="gauge-section">
        <div className="gauge-card">
          <svg className="gauge-svg" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="gaugeGradientGreen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#408A71" />
                <stop offset="100%" stopColor="#B0E4CC" />
              </linearGradient>
              <linearGradient id="gaugeGradientAmber" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c4d48a" />
                <stop offset="100%" stopColor="#c0a060" />
              </linearGradient>
              <linearGradient id="gaugeGradientRed" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#d46b6b" />
                <stop offset="100%" stopColor="#b07ea8" />
              </linearGradient>
            </defs>
            <circle className="gauge-bg" cx="50" cy="50" r="45" />
            <circle
              className="gauge-fill"
              cx="50"
              cy="50"
              r="45"
              stroke={getGaugeColor(report.career_fit)}
              strokeDasharray="283"
              strokeDashoffset={gaugeOffset}
            />
            <text className="gauge-text" x="50" y="48" textAnchor="middle" dominantBaseline="middle">
              {report.career_fit_percent}%
            </text>
            <text className="gauge-subtext" x="50" y="62" textAnchor="middle">
              career fit
            </text>
          </svg>
          <div className="gauge-label" style={{ color: getLabelColor(report.career_fit) }}>
            {report.career_fit_label}
          </div>
          <div className="gauge-description">{report.career_fit_description}</div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards stagger-children">
        <div className="summary-card total">
          <div className="card-value">{report.summary.total_skills}</div>
          <div className="card-label">Total Skills</div>
        </div>
        <div className="summary-card mastered">
          <div className="card-value">{report.summary.mastered}</div>
          <div className="card-label">Mastered</div>
        </div>
        <div className="summary-card partial">
          <div className="card-value">{report.summary.partial}</div>
          <div className="card-label">Needs Work</div>
        </div>
        <div className="summary-card missing">
          <div className="card-value">{report.summary.missing}</div>
          <div className="card-label">Missing</div>
        </div>
      </div>

      {/* Skill Breakdown */}
      <div className="skill-breakdown">
        {report.skills.mastered.length > 0 && (
          <div className="breakdown-section">
            <div className="breakdown-title">
              <span className="status-dot green" />
              Mastered Skills
            </div>
            {report.skills.mastered.map((skill) => (
              <div key={skill.id} className="skill-breakdown-card">
                <div className="skill-breakdown-left">
                  <span className="skill-breakdown-name">{skill.name}</span>
                  <span className="skill-category-badge">{skill.category}</span>
                </div>
                <div className="skill-breakdown-right">
                  <div className="proficiency-bar-container">
                    <div
                      className="proficiency-bar-fill green"
                      style={{ width: `${skill.proficiency * 100}%` }}
                    />
                  </div>
                  <span className="proficiency-percent green">
                    {Math.round(skill.proficiency * 100)}%
                  </span>
                  <span className="weight-badge">w: {skill.weight}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {report.skills.partial.length > 0 && (
          <div className="breakdown-section">
            <div className="breakdown-title">
              <span className="status-dot amber" />
              Needs Improvement
            </div>
            {report.skills.partial.map((skill) => (
              <div key={skill.id} className="skill-breakdown-card">
                <div className="skill-breakdown-left">
                  <span className="skill-breakdown-name">{skill.name}</span>
                  <span className="skill-category-badge">{skill.category}</span>
                </div>
                <div className="skill-breakdown-right">
                  <div className="proficiency-bar-container">
                    <div
                      className="proficiency-bar-fill amber"
                      style={{ width: `${skill.proficiency * 100}%` }}
                    />
                  </div>
                  <span className="proficiency-percent amber">
                    {Math.round(skill.proficiency * 100)}%
                  </span>
                  <span className="weight-badge">w: {skill.weight}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {report.skills.missing.length > 0 && (
          <div className="breakdown-section">
            <div className="breakdown-title">
              <span className="status-dot red" />
              Missing Skills
            </div>
            {report.skills.missing.map((skill) => (
              <div key={skill.id} className="skill-breakdown-card">
                <div className="skill-breakdown-left">
                  <span className="skill-breakdown-name">{skill.name}</span>
                  <span className="skill-category-badge">{skill.category}</span>
                </div>
                <div className="skill-breakdown-right">
                  <div className="proficiency-bar-container">
                    <div className="proficiency-bar-fill red" style={{ width: '0%' }} />
                  </div>
                  <span className="proficiency-percent red">0%</span>
                  <span className="weight-badge">w: {skill.weight}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category Scores */}
      {report.category_scores && (
        <div className="category-scores">
          <h3>Proficiency by Category</h3>
          <div className="category-bars">
            {Object.entries(report.category_scores)
              .sort(([, a], [, b]) => b - a)
              .map(([category, score]) => (
                <div key={category} className="category-bar-item">
                  <span className="category-bar-label">{category.replace(/_/g, ' ')}</span>
                  <div className="category-bar-track">
                    <div
                      className="category-bar-fill"
                      style={{ width: `${score * 100}%` }}
                    />
                  </div>
                  <span className="category-bar-value">{Math.round(score * 100)}%</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="report-actions">
        <button className="btn-primary" id="next-module-btn" onClick={onExploreGraph}>
          <UiIcon name="graph" size={16} className="icon-inline" /> Explore Knowledge Graph →
        </button>
        <button className="btn-secondary" onClick={onStartOver} id="start-over-btn">
          Start Over
        </button>
      </div>
    </div>
  );
}
