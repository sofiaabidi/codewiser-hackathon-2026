import { useState, useEffect } from 'react';
import { fetchRoles, fetchRoleSkills } from '../utils/api';
import UiIcon, { RoleIcon } from './UiIcon';

const STEP_LABELS = {
  select_role: 'Choose Role',
  input_skills: 'Rate Skills',
  gap_report: 'Gap Report',
  knowledge_graph: 'Knowledge Graph',
  study_plan: 'Study Plan',
};

export default function RoleSelector({
  onSelect,
  onBack,
  sessions = [],
  onContinueSession,
  onDeleteSession,
}) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRoles()
      .then((data) => {
        setRoles(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleSelect = async (role) => {
    try {
      const roleData = await fetchRoleSkills(role.id);
      onSelect(role, roleData.skills);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <span className="loading-text">Loading career roles…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Connection Error</h3>
        <p>Make sure the backend is running on port 5000. Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="role-selector">
      <button className="back-btn" onClick={onBack}>
        ← Back
      </button>

      {sessions.length > 0 && (
        <div className="saved-sessions">
          <h3 className="saved-sessions-title">Continue your saved progress</h3>
          <div className="saved-sessions-grid">
            {sessions.map((s) => (
              <div key={s.id} className="saved-session-card">
                <div className="saved-session-top">
                  <button
                    type="button"
                    className="saved-session-delete"
                    onClick={() => onDeleteSession && onDeleteSession(s)}
                    title="Delete saved progress"
                    aria-label={`Delete saved progress for ${s.role_title}`}
                  >
                    ×
                  </button>
                  <div className="saved-session-role">{s.role_title}</div>
                  <div className="saved-session-step">
                    {STEP_LABELS[s.step_key] || s.step_key} · {s.progress_percent}%
                  </div>
                </div>

                <div className="saved-session-metrics">
                  {s.metrics?.career_fit_percent !== undefined && s.metrics?.career_fit_percent !== null && (
                    <span className="saved-session-chip">
                      Career Fit: {Math.round(s.metrics.career_fit_percent)}%
                    </span>
                  )}

                  {typeof s.metrics?.total_days === 'number' && (
                    <span className="saved-session-chip">
                      Days Done: {s.metrics.days_done}/{s.metrics.total_days}
                    </span>
                  )}
                </div>

                <div className="saved-session-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => onContinueSession && onContinueSession(s.id)}
                  >
                    Continue
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-header">
        <h2>Choose Your Target Role</h2>
        <p>Select the career role you're aiming for. We'll analyze what skills you need.</p>
      </div>

      <div className="roles-grid stagger-children">
        {roles.map((role) => (
          <div
            key={role.id}
            className="role-card"
            onClick={() => handleSelect(role)}
            style={{ '--card-accent': `linear-gradient(135deg, ${role.color}, ${role.color}88)` }}
            id={`role-card-${role.id}`}
          >
            <div className="role-card-header">
              <div className="role-icon"><RoleIcon roleId={role.id} size={24} /></div>
              <h3>{role.title}</h3>
            </div>
            <p className="role-desc">{role.description}</p>
            <div className="role-meta">
              <span className="skill-count">
                <UiIcon name="book" size={14} className="icon-inline" /> {role.skill_count} skills required
              </span>
            </div>
            <span className="select-arrow">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
