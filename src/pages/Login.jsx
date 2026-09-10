import { useState } from "react";
import { Link } from "react-router-dom";

function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    console.log("Login form submitted:", formData);
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <Link className="auth-brand" to="/" aria-label="Back to OnTrack home">
          <img src="/ontrack-logo.png" alt="OnTrack" />
        </Link>

        <div className="auth-heading">
          <span className="auth-kicker">Welcome back</span>
          <h1 id="login-heading">Log in to OnTrack</h1>
          <p>Pick up where you left off and keep your momentum going.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">Email address</label>
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

          <div className="form-group">
            <div className="label-row">
              <label htmlFor="login-password">Password</label>
              <button className="text-button" type="button">Forgot password?</button>
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="auth-submit" type="submit">Log in</button>
        </form>

        <p className="auth-switch">
          New to OnTrack? <Link to="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}

export default Login;
