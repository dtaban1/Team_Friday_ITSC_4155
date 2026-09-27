import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

function Home() {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] =
    useState(true);
  const [isLoggingOut, setIsLoggingOut] =
    useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/session`,
          {
            credentials: "include",
          }
        );

        if (!response.ok) {
          setUser(null);
          return;
        }

        const data = await response.json();
        setUser(data.user);
      } catch (error) {
        console.error(
          "Unable to check login session:",
          error
        );

        setUser(null);
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      const response = await fetch(
        `${API_URL}/api/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Logout request failed");
      }

      setUser(null);
    } catch (error) {
      console.error("Unable to log out:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="landing-page">
      <header className="site-header">
        <Link
          className="brand"
          to="/"
          aria-label="OnTrack home"
        >
          <img
            className="brand-logo"
            src="/ontrack-logo.png"
            alt="OnTrack"
          />
        </Link>

        <nav
          className="header-actions"
          aria-label="Account navigation"
        >
          {!isCheckingSession && user ? (
            <>
              <span className="signed-in-email">
                {user.email}
              </span>

              <button
                className="button button-primary button-small"
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut
                  ? "Logging out..."
                  : "Log out"}
              </button>
            </>
          ) : (
            !isCheckingSession && (
              <>
                <Link
                  className="button button-ghost"
                  to="/login"
                >
                  Log in
                </Link>

                <Link
                  className="button button-primary button-small"
                  to="/signup"
                >
                  Create account
                </Link>
              </>
            )
          )}
        </nav>
      </header>

      <main className="home-main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span
                className="sparkle"
                aria-hidden="true"
              >
                ✣
              </span>
              Small steps. Real progress.
            </div>

            <h1>
              Make every day
              <span className="accent-text">
                count.
              </span>
            </h1>

            <p className="hero-description">
              Build better habits, keep your momentum,
              and see how far you’ve come—all in one
              simple place.
            </p>

            <div className="hero-actions">
              {user ? (
                <span className="button button-start">
                  Welcome back
                  <span
                    className="arrow"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                </span>
              ) : (
                <>
                  <Link
                    className="button button-start"
                    to="/signup"
                  >
                    Start tracking free
                    <span
                      className="arrow"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </Link>

                  <Link
                    className="button button-secondary"
                    to="/login"
                  >
                    I already have an account
                  </Link>
                </>
              )}
            </div>

            <p className="microcopy">
              <span
                className="micro-check"
                aria-hidden="true"
              >
                ✓
              </span>
              Free to start. No credit card needed.
            </p>
          </div>

          <div
            className="hero-decoration"
            aria-hidden="true"
          >
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
