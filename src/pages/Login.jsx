import { useState } from "react";
import { Link } from "react-router-dom";

function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    console.log("Login form submitted:", formData);
  };

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <aside className="auth-side-panel">
          <div className="auth-side-content">
            <span className="auth-badge">
              Small steps. Real progress.
            </span>

            <h2>
              Stay focused.
              <br />
              Keep moving forward.
            </h2>

            <p>
              Organize your tasks, build strong habits,
              and keep track of the goals that matter most.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feature-item">
                <span>✓</span>
                Plan your day with clarity
              </div>

              <div className="auth-feature-item">
                <span>✓</span>
                Build habits that actually stick
              </div>

              <div className="auth-feature-item">
                <span>✓</span>
                See your progress over time
              </div>
            </div>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-card">
            <Link
              className="auth-logo"
              to="/"
              aria-label="Back to OnTrack home"
            >
              <img
                src="/ontrack-logo.png"
                alt="OnTrack"
              />
            </Link>

            <div className="auth-heading">
              <span className="auth-kicker">
                Welcome back
              </span>

              <h1>
                Log in to your account
              </h1>

              <p>
                Enter your details below to continue
                your OnTrack journey.
              </p>
            </div>

            <form
              className="auth-form"
              onSubmit={handleSubmit}
            >
              <div className="auth-form-group">
                <label htmlFor="login-email">
                  Email address
                </label>

                <input
                  id="login-email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="auth-form-group">
                <div className="auth-label-row">
                  <label htmlFor="login-password">
                    Password
                  </label>

                  <button
                    className="auth-text-button"
                    type="button"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="auth-password-wrap">
                  <input
                    id="login-password"
                    name="password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />

                  <button
                    className="auth-password-toggle"
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) => !current
                      )
                    }
                  >
                    {
                      showPassword
                        ? "Hide"
                        : "Show"
                    }
                  </button>
                </div>
              </div>

              <div className="auth-options">
                <label className="auth-remember">
                  <input type="checkbox" />
                  <span>Remember me</span>
                </label>
              </div>

              <button
                className="auth-submit"
                type="submit"
              >
                Log in
                <span>→</span>
              </button>
            </form>

            <div className="auth-divider">
              <span>New to OnTrack?</span>
            </div>

            <Link
              className="auth-secondary-button"
              to="/signup"
            >
              Create an account
            </Link>

            <p className="auth-footer-text">
              Keep your account information secure
              and continue building better habits
              with OnTrack.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

export default Login;
