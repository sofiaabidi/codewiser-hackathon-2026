export default function AuthModal({ onClose }) {
  return (
    <div className="auth-modal-overlay" role="dialog" aria-modal="true">
      <div className="auth-modal">
        <h2>Sign in to save progress</h2>
        <p>
          Your study plan (target role + mastery progress) will be stored and you can continue later.
        </p>

        <div className="auth-buttons">
          <a className="auth-btn auth-btn-github" href="http://localhost:5000/api/auth/login/github">
            Continue with GitHub
          </a>
        </div>

        <div className="auth-footer">
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

