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


  const handleSubmit = (event) => {
    event.preventDefault();

    if (
      formData.password !==
      formData.confirmPassword
    ) {
      setError("Passwords do not match.");
      return;
    }

    setError("");

    console.log(
      "Signup form submitted:",
      formData
    );
  };


  return (
    <main className="login-page">

      <section className="login-shell signup-shell">

        {/* LEFT SIDE */}
        <aside className="login-showcase">

          <Link
            className="login-brand"
            to="/"
          >
            <img
              src="/ontrack-logo.png"
              alt="OnTrack"
            />
          </Link>


          <div className="login-showcase-content">

            <span className="login-badge">
              Your progress starts here
            </span>

            <h2>
              Build habits.
              <br />
              Reach your goals.
            </h2>

            <p>
              Create your free OnTrack account and turn
              everyday actions into meaningful progress.
            </p>


            <div className="login-benefits">

              <div className="login-benefit">

                <span className="login-benefit-icon">
                  ✓
                </span>

                <span>
                  Organize tasks and responsibilities
                </span>

              </div>


              <div className="login-benefit">

                <span className="login-benefit-icon">
                  ✓
                </span>

                <span>
                  Track habits and maintain streaks
                </span>

              </div>


              <div className="login-benefit">

                <span className="login-benefit-icon">
                  ✓
                </span>

                <span>
                  Follow your goals and progress
                </span>

              </div>

            </div>

          </div>


          <p className="login-showcase-footer">
            OnTrack · Start today. Grow every day.
          </p>

        </aside>


        {/* RIGHT SIDE */}
        <section className="login-form-panel signup-form-panel">

          <div className="login-mobile-brand">

            <Link to="/">

              <img
                src="/ontrack-logo.png"
                alt="OnTrack"
              />

            </Link>

          </div>


          <div className="login-card signup-card">

            <div className="login-heading">

              <span className="login-kicker">
                Get started
              </span>

              <h1>
                Create your account
              </h1>

              <p>
                Create your OnTrack account and start
                building better routines today.
              </p>

            </div>


            <form
              className="login-form signup-form"
              onSubmit={handleSubmit}
            >

              {/* NAME */}
              <div className="login-form-group">

                <label htmlFor="signup-name">
                  Full name
                </label>

                <div className="login-input-wrap">

                  <span className="login-input-icon">
                    U
                  </span>

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

              </div>


              {/* EMAIL */}
              <div className="login-form-group">

                <label htmlFor="signup-email">
                  Email address
                </label>

                <div className="login-input-wrap">

                  <span className="login-input-icon">
                    @
                  </span>

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

              </div>


              {/* PASSWORD */}
              <div className="login-form-group">

                <label htmlFor="signup-password">
                  Password
                </label>

                <div className="login-input-wrap">

                  <span className="login-input-icon login-dot">
                    ●
                  </span>

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
                    className="login-password-toggle"
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) => !current
                      )
                    }
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>

                </div>

                <span className="password-hint">
                  Use at least 8 characters.
                </span>

              </div>


              {/* CONFIRM PASSWORD */}
              <div className="login-form-group">

                <label htmlFor="signup-confirm-password">
                  Confirm password
                </label>

                <div className="login-input-wrap">

                  <span className="login-input-icon login-dot">
                    ●
                  </span>

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
                    className="login-password-toggle"
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


              {/* ERROR */}
              {error && (
                <p
                  className="signup-error"
                  role="alert"
                >
                  {error}
                </p>
              )}


              {/* CREATE ACCOUNT */}
              <button
                className="login-submit"
                type="submit"
              >
                Create account
                <span>→</span>
              </button>

            </form>


            <div className="login-divider">

              <span>
                Already have an account?
              </span>

            </div>


            <Link
              className="login-create-account"
              to="/login"
            >
              Log in
            </Link>


            <p className="login-privacy">
              By creating an account, you can begin
              organizing your tasks, habits, events,
              and goals with OnTrack.
            </p>

          </div>

        </section>

      </section>

    </main>
  );
}

export default Signup;
