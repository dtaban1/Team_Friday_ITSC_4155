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
    <main className="login-page">

      <section className="login-shell">

        {/* LEFT SIDE */}
        <aside className="login-showcase">

          <Link
            className="login-brand"
            to="/"
            aria-label="Back to OnTrack home"
          >
            <img src="/ontrack-logo.png" alt="OnTrack" />
          </Link>

          <div className="login-showcase-content">

            <span className="login-badge">
              Build better days, one step at a time
            </span>

            <h2>
              Stay focused.
              <br />
              Keep moving forward.
            </h2>

            <p>
              Organize your tasks, build strong habits, and keep track
              of the goals that matter most—all in one place.
            </p>

            <div className="login-benefits">

              <div className="login-benefit">
                <span className="login-benefit-icon">✓</span>
                <span>Plan your day with clarity</span>
              </div>

              <div className="login-benefit">
                <span className="login-benefit-icon">✓</span>
                <span>Build habits that actually stick</span>
              </div>

              <div className="login-benefit">
                <span className="login-benefit-icon">✓</span>
                <span>See your progress over time</span>
              </div>

            </div>

          </div>

          <p className="login-showcase-footer">
            OnTrack · Make progress feel simple.
          </p>

        </aside>


        {/* RIGHT SIDE */}
        <section className="login-form-panel">

          <div className="login-mobile-brand">
            <Link to="/">
              <img src="/ontrack-logo.png" alt="OnTrack" />
            </Link>
          </div>

          <div className="login-card">

            <div className="login-heading">

              <span className="login-kicker">
                Welcome back
              </span>

              <h1>
                Log in to your account
              </h1>

              <p>
                Enter your details below to continue your
                OnTrack journey.
              </p>

            </div>


            <form
              className="login-form"
              onSubmit={handleSubmit}
            >

              {/* EMAIL */}
              <div className="login-form-group">

                <label htmlFor="login-email">
                  Email address
                </label>

                <div className="login-input-wrap">

                  <span className="login-input-icon">
                    @
                  </span>

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

              </div>


              {/* PASSWORD */}
              <div className="login-form-group">

                <div className="login-label-row">

                  <label htmlFor="login-password">
                    Password
                  </label>

                  <button
                    className="login-text-button"
                    type="button"
                  >
                    Forgot password?
                  </button>

                </div>


                <div className="login-input-wrap">

                  <span className="login-input-icon login-dot">
                    ●
                  </span>

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

              </div>


              {/* REMEMBER ME */}
              <div className="login-options">

                <label className="login-remember">

                  <input type="checkbox" />

                  <span>
                    Remember me
                  </span>

                </label>

              </div>


              {/* LOGIN BUTTON */}
              <button
                className="login-submit"
                type="submit"
              >
                Log in
                <span>→</span>
              </button>

            </form>


            <div className="login-divider">
              <span>
                New to OnTrack?
              </span>
            </div>


            <Link
              className="login-create-account"
              to="/signup"
            >
              Create an account
            </Link>


            <p className="login-privacy">
              Keep your account information secure and
              continue building better habits with OnTrack.
            </p>

          </div>

        </section>

      </section>

    </main>
  );
}

export default Login;
