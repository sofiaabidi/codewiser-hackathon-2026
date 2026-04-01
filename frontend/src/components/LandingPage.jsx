export default function LandingPage({ onStart }) {
  return (
    <div className="landing">
      <div className="landing-badge">
        <span className="dot" />
        Deterministic Intelligence — No AI APIs
      </div>

      <h1>
        <span className="gradient-text">PathForge</span>
      </h1>

      <p className="landing-subtitle">
        Chart your career path with algorithmic precision. Identify skill gaps,
        map knowledge dependencies, and generate optimized study plans — all
        powered by deterministic logic.
      </p>

      <button className="landing-cta" onClick={onStart} id="get-started-btn">
        Get Started
        <span className="arrow">→</span>
      </button>

      <div className="landing-features">
        <div className="landing-feature">
          <div className="feature-icon">🎯</div>
          <h3>Skill Gap Analysis</h3>
          <p>Compare your skills against any career role and find what's missing</p>
        </div>
        <div className="landing-feature">
          <div className="feature-icon">🧠</div>
          <h3>Knowledge Graph</h3>
          <p>Map prerequisite concepts and find your root knowledge gaps</p>
        </div>
        <div className="landing-feature">
          <div className="feature-icon">📅</div>
          <h3>Study Optimizer</h3>
          <p>Generate priority-based study plans with spaced repetition</p>
        </div>
      </div>
    </div>
  );
}
