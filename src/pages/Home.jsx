import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="landing-page">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="OnTrack home">
          <img className="brand-logo" src="/ontrack-logo.png" alt="OnTrack" />
        </Link>

        <nav className="header-actions" aria-label="Account navigation">
          <Link className="button button-ghost" to="/login">
            Log in
          </Link>
          <Link className="button button-primary button-small" to="/signup">
            Create account
          </Link>
        </nav>
      </header>

      <main className="home-main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="sparkle" aria-hidden="true">✣</span>
              Small steps. Real progress.
            </div>

            <h1>
              Make every day
              <span className="accent-text">count.</span>
            </h1>

            <p className="hero-description">
              Build better habits, keep your momentum, and see how far
              you’ve come—all in one simple place.
            </p>

            <div className="hero-actions">
              <Link className="button button-start" to="/signup">
                Start tracking free
                <span className="arrow" aria-hidden="true">→</span>
              </Link>

              <Link className="button button-secondary" to="/login">
                I already have an account
              </Link>
            </div>

            <p className="microcopy">
              <span className="micro-check" aria-hidden="true">✓</span>
              Free to start. No credit card needed.
            </p>
          </div>

          <div className="hero-decoration" aria-hidden="true">
            <div className="decor-circle decor-circle-one" />
            <div className="decor-circle decor-circle-two" />
            <div className="decor-pill decor-pill-one" />
            <div className="decor-pill decor-pill-two" />
          </div>
        </section>
      </main>
    </div>
  );
}

export default Home;
