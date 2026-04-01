import { useState, useEffect } from 'react';
import { fetchRoles, fetchRoleSkills } from '../utils/api';

export default function RoleSelector({ onSelect, onBack }) {
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
              <div className="role-icon">{role.icon}</div>
              <h3>{role.title}</h3>
            </div>
            <p className="role-desc">{role.description}</p>
            <div className="role-meta">
              <span className="skill-count">
                📚 {role.skill_count} skills required
              </span>
            </div>
            <span className="select-arrow">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
