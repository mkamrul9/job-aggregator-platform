'use client';

import React, { useState } from 'react';

export type ActiveTab = 'discover' | 'saved' | 'applications' | 'alerts' | 'profile';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  savedCount: number;
  applicationsCount: number;
  alertsCount: number;
  candidateName: string | null;
  onOpenAuth: () => void;
  onOpenFeedback: () => void;
  onOpenDemoInfo: () => void;
}

export default function Navbar({
  activeTab,
  onSelectTab,
  savedCount,
  applicationsCount,
  alertsCount,
  candidateName,
  onOpenAuth,
  onOpenFeedback,
  onOpenDemoInfo
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTabClick = (tab: ActiveTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Top Demo Ribbon */}
      <div className="demo-ribbon">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="demo-tag">
            <span>✦</span> South Asia Tech Demo (Synthetic Fixtures)
          </span>
          <span style={{ color: 'var(--seekers-text-muted)' }}>|</span>
          <span style={{ fontSize: '0.75rem' }}>Dhaka & Regional Tech Roles</span>
        </div>

        <button
          type="button"
          onClick={onOpenDemoInfo}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--seekers-amber-400)',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '0.75rem'
          }}
        >
          View Scope & Provenance ↗
        </button>
      </div>

      {/* Main Navbar */}
      <header className="site-nav">
        <div className="seekers-container">
          <div className="nav-content">
            
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div
                className="brand-link"
                style={{ cursor: 'pointer' }}
                onClick={() => handleTabClick('discover')}
                role="button"
                tabIndex={0}
              >
                <div className="brand-mark">S</div>
                <div className="brand-text">seek<span>ers</span></div>
              </div>

              {/* Desktop Workspace Tabs */}
              <nav className="workspace-tabs" style={{ display: 'flex' }} aria-label="Candidate Navigation">
                <button
                  type="button"
                  className={`tab-item ${activeTab === 'discover' ? 'active' : ''}`}
                  onClick={() => handleTabClick('discover')}
                  id="nav-tab-discover"
                >
                  Discover Roles
                </button>

                <button
                  type="button"
                  className={`tab-item ${activeTab === 'saved' ? 'active' : ''}`}
                  onClick={() => handleTabClick('saved')}
                  id="nav-tab-saved"
                >
                  Saved Roles
                  {savedCount > 0 && <span className="tab-count">{savedCount}</span>}
                </button>

                <button
                  type="button"
                  className={`tab-item ${activeTab === 'applications' ? 'active' : ''}`}
                  onClick={() => handleTabClick('applications')}
                  id="nav-tab-applications"
                >
                  Applications
                  {applicationsCount > 0 && <span className="tab-count">{applicationsCount}</span>}
                </button>

                <button
                  type="button"
                  className={`tab-item ${activeTab === 'alerts' ? 'active' : ''}`}
                  onClick={() => handleTabClick('alerts')}
                  id="nav-tab-alerts"
                >
                  Alerts
                  {alertsCount > 0 && <span className="tab-count">{alertsCount}</span>}
                </button>

                <button
                  type="button"
                  className={`tab-item ${activeTab === 'profile' ? 'active' : ''}`}
                  onClick={() => handleTabClick('profile')}
                  id="nav-tab-profile"
                >
                  Profile & Skills
                </button>
              </nav>
            </div>

            {/* Right Side Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              
              <button
                type="button"
                className="btn-ghost"
                onClick={onOpenFeedback}
                style={{ fontSize: '0.8125rem' }}
                id="nav-report-btn"
                title="Report a listing issue or feedback"
              >
                ⚑ Report
              </button>

              {candidateName ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleTabClick('profile')}
                  style={{ minHeight: '38px', padding: '0.35rem 0.85rem', fontSize: '0.8125rem' }}
                  id="candidate-account-btn"
                >
                  👤 {candidateName}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onOpenAuth}
                  style={{ minHeight: '38px', padding: '0.35rem 0.85rem', fontSize: '0.8125rem' }}
                  id="nav-signin-btn"
                >
                  Sign In
                </button>
              )}

              {/* Mobile Hamburger Button (<768px) */}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                style={{ width: '40px', height: '40px', minHeight: '40px', padding: 0 }}
                id="mobile-nav-toggle"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? '✕' : '☰'}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Dropdown Menu (<768px) */}
        {mobileMenuOpen && (
          <div style={{
            backgroundColor: 'var(--seekers-bg-elevated)',
            borderTop: '1px solid var(--seekers-border-subtle)',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem'
          }}>
            <button
              type="button"
              className={`tab-item ${activeTab === 'discover' ? 'active' : ''}`}
              onClick={() => handleTabClick('discover')}
              style={{ width: '100%', justifyContent: 'flex-start', minHeight: '44px' }}
            >
              🔍 Discover Roles
            </button>

            <button
              type="button"
              className={`tab-item ${activeTab === 'saved' ? 'active' : ''}`}
              onClick={() => handleTabClick('saved')}
              style={{ width: '100%', justifyContent: 'flex-start', minHeight: '44px' }}
            >
              ★ Saved Roles ({savedCount})
            </button>

            <button
              type="button"
              className={`tab-item ${activeTab === 'applications' ? 'active' : ''}`}
              onClick={() => handleTabClick('applications')}
              style={{ width: '100%', justifyContent: 'flex-start', minHeight: '44px' }}
            >
              📋 Applications Tracker ({applicationsCount})
            </button>

            <button
              type="button"
              className={`tab-item ${activeTab === 'alerts' ? 'active' : ''}`}
              onClick={() => handleTabClick('alerts')}
              style={{ width: '100%', justifyContent: 'flex-start', minHeight: '44px' }}
            >
              🔔 Job Alerts ({alertsCount})
            </button>

            <button
              type="button"
              className={`tab-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => handleTabClick('profile')}
              style={{ width: '100%', justifyContent: 'flex-start', minHeight: '44px' }}
            >
              👤 Candidate Profile & Skills
            </button>
          </div>
        )}
      </header>
    </>
  );
}
