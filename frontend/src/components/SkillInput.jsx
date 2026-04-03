import { useState } from 'react';
import { analyzeGap } from '../utils/api';
import { RoleIcon } from './UiIcon';

export default function SkillInput({ role, skills, onAnalyze, onBack }) {
  const [proficiencies, setProficiencies] = useState(() => {
    const init = {};
    skills.forEach((s) => {
      init[s.id] = 0;
    });
    return init;
  });
  const [dontKnow, setDontKnow] = useState(() => {
    const init = {};
    skills.forEach((s) => {
      init[s.id] = true;
    });
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSlider = (skillId, value) => {
    setProficiencies((prev) => ({ ...prev, [skillId]: parseInt(value) }));
    if (parseInt(value) > 0) {
      setDontKnow((prev) => ({ ...prev, [skillId]: false }));
    }
  };

  const handleDontKnow = (skillId, checked) => {
    setDontKnow((prev) => ({ ...prev, [skillId]: checked }));
    if (checked) {
      setProficiencies((prev) => ({ ...prev, [skillId]: 0 }));
    }
  };

  const getValueClass = (val) => {
    if (val === 0) return 'zero';
    if (val < 40) return 'low';
    if (val < 70) return 'mid';
    return 'high';
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const userSkills = {};
      skills.forEach((s) => {
        if (!dontKnow[s.id] && proficiencies[s.id] > 0) {
          userSkills[s.id] = { proficiency: proficiencies[s.id] / 100 };
        }
      });
      const report = await analyzeGap(role.id, userSkills);
      onAnalyze(report);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="skill-input-page">
      <button className="back-btn" onClick={onBack}>
        ← Back
      </button>

      <div className="section-header">
        <h2>Rate Your Skills</h2>
        <p>For each skill below, set your current proficiency level.</p>
      </div>

      <div className="role-banner">
        <div className="role-icon"><RoleIcon roleId={role.id} size={22} /></div>
        <div className="role-banner-info">
          <h3>{role.title}</h3>
          <p>{skills.length} skills to evaluate</p>
        </div>
      </div>

      <div className="skills-list stagger-children">
        {skills.map((skill) => (
          <div key={skill.id} className="skill-item" id={`skill-input-${skill.id}`}>
            <div className="skill-item-header">
              <div className="skill-item-info">
                <h4>{skill.name}</h4>
                <span className="skill-category-badge">{skill.category}</span>
              </div>
              <span className="skill-weight">weight: {skill.weight}</span>
            </div>
            <p className="skill-description">{skill.description}</p>

            <div className="slider-row">
              <span className="slider-label">Proficiency</span>
              <input
                type="range"
                className="proficiency-slider"
                min="0"
                max="100"
                value={dontKnow[skill.id] ? 0 : proficiencies[skill.id]}
                onChange={(e) => handleSlider(skill.id, e.target.value)}
                disabled={dontKnow[skill.id]}
                id={`slider-${skill.id}`}
              />
              <span className={`slider-value ${getValueClass(dontKnow[skill.id] ? 0 : proficiencies[skill.id])}`}>
                {dontKnow[skill.id] ? '—' : `${proficiencies[skill.id]}%`}
              </span>
            </div>

            <label className="dont-know-check">
              <input
                type="checkbox"
                checked={dontKnow[skill.id]}
                onChange={(e) => handleDontKnow(skill.id, e.target.checked)}
              />
              I don't know this skill
            </label>
          </div>
        ))}
      </div>

      {error && (
        <div className="error-container">
          <h3>Analysis Error</h3>
          <p>{error}</p>
        </div>
      )}

      <button
        className="analyze-btn"
        onClick={handleAnalyze}
        disabled={loading}
        id="analyze-btn"
      >
        {loading ? (
          <>
            <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            Analyzing…
          </>
        ) : (
          <>
            🔍 Analyze My Gaps
          </>
        )}
      </button>
    </div>
  );
}
