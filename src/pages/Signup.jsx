import { useState } from "react";
import { Link } from "react-router-dom";

function Signup() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");

    try {
      const response = await fetch("http://localhost:5000/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message);
        return;
      }

      console.log("Signup successful:", data);
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error("Signup request failed:", err);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell auth-shell-signup">
        <aside className="auth-side-panel">
          <div className="auth-side-content">
            <span className="auth-badge">
              Your progress starts here
            </span>

            <h2>
              Build habits.
              <br />
              Reach your goals.
            </h2>

            <p>
              Create your OnTrack account and turn
              everyday actions into meaningful progress.
            </p>

            <div className="auth-feature-list">
              <div className="auth-feature-item">
                <span>✓</span>
                Organize tasks and responsibilities
              </div>

              <div className="auth-feature-item">
                <span>✓</span>
                Track habits and maintain streaks
              </div>

              <div className="auth-feature-item">
                <span>✓</span>
                Follow your goals and progress
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
                Get started
              </span>

              <h1>
                Create your account
              </h1>

              <p>
                Start building better routines
                and staying on track today.
              </p>
            </div>

            <form
              className="auth-form signup-form"
              onSubmit={handleSubmit}
            >
              <div className="auth-form-group">
                <label htmlFor="signup-name">
                  Full name
                </label>

                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="auth-form-group">
                <label htmlFor="signup-email">
                  Email address
                </label>

                <input
                  id="signup-email"
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
                <label htmlFor="signup-password">
                  Password
                </label>

                <div className="auth-password-wrap">
                  <input
                    id="signup-password"
                    name="password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    minLength="8"
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

                <span className="auth-hint">
                  Use at least 8 characters.
                </span>
              </div>

              <div className="auth-form-group">
                <label htmlFor="signup-confirm-password">
                  Confirm password
                </label>

                <div className="auth-password-wrap">
                  <input
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    value={
                      formData.confirmPassword
                    }
                    onChange={handleChange}
                    placeholder="Enter your password again"
                    autoComplete="new-password"
                    minLength="8"
                    required
                  />

                  <button
                    className="auth-password-toggle"
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        (current) => !current
                      )
                    }
                  >
                    {
                      showConfirmPassword
                        ? "Hide"
                        : "Show"
                    }
                  </button>
                </div>
              </div>

              {error && (
                <p
                  className="auth-error"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                className="auth-submit"
                type="submit"
              >
                Create account
                <span>→</span>
              </button>
            </form>

            <div className="auth-divider">
              <span>
                Already have an account?
              </span>
            </div>

            <Link
              className="auth-secondary-button"
              to="/login"
            >
              Log in
            </Link>

            <p className="auth-footer-text">
              Create your account and start organizing
              your tasks, habits, events, and goals.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

export default Signup;
