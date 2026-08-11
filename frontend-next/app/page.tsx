import AuthComponent from '../components/AuthComponent';
import ResumeUpload from '../components/ResumeUpload';
import JobSearch from '../components/JobSearch';

export default function Home() {
  return (
    <main>

      {/* ─── Hero Section ─────────────────────────────── */}
      <section className="hero-section">
        <div className="seekers-container">
          <div className="hero-badge fade-up">
            <span>✦</span> AI-Powered Job Discovery
          </div>

          <h1 className="hero-title fade-up delay-1">
            Find your next<br />
            <span className="accent">opportunity.</span>
          </h1>

          <p className="hero-subtitle fade-up delay-2">
            Seekers aggregates millions of real-time job listings,
            matches them against your skills, and surfaces only what matters.
          </p>

          <div className="hero-stats fade-up delay-3">
            <div className="hero-stat">
              <div className="hero-stat-num">2.4M+</div>
              <div className="hero-stat-label">Live Roles</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">180+</div>
              <div className="hero-stat-label">Sources</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">Real-time</div>
              <div className="hero-stat-label">Updates</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Main Grid ────────────────────────────────── */}
      <section style={{ paddingBottom: '5rem' }}>
        <div className="seekers-container">
          <div className="seekers-grid">

            {/* Left Column */}
            <div className="flex-col">
              <div className="card fade-up delay-1">
                <AuthComponent />
              </div>
              <div className="card fade-up delay-2">
                <ResumeUpload />
              </div>
            </div>

            {/* Right Column */}
            <div className="card fade-up delay-1">
              <JobSearch />
            </div>

          </div>
        </div>
      </section>

    </main>
  );
}
