'use client';

import React, { useState } from 'react';
import { useAuth } from '../lib/auth-context';

export type ActiveTab =
  | 'discover'
  | 'recommendations'
  | 'saved'
  | 'applications'
  | 'alerts'
  | 'profile';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  savedCount: number;
  applicationsCount: number;
  alertsCount: number;
  recommendationsCount?: number;
  onOpenAuth: () => void;
  onOpenFeedback: () => void;
  onOpenDemoInfo: () => void;
  onOpenDataControl: () => void;
}

export default function Navbar({
  activeTab,
  onSelectTab,
  savedCount,
  applicationsCount,
  alertsCount,
  recommendationsCount,
  onOpenAuth,
  onOpenFeedback,
  onOpenDemoInfo,
  onOpenDataControl,
}: NavbarProps) {
  const { status, user, profile, isDemo, signOut, retrySync, exitDemoMode } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const handleTabClick = (tab: ActiveTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  };

  const displayName = profile?.name || user?.displayName || user?.email || (isDemo ? 'Farhan Ahmed' : null);

  return (
    <>
      {/* Top Demo Ribbon */}
      <div className="demo-ribbon">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="demo-tag">
            <span>✦</span> South Asia Tech Platform
          </span>
          <span style={{ color: 'var(--seekers-text-muted)' }}>|</span>
          <span style={{ fontSize: '0.75rem' }}>
            {status === 'READY'
              ? 'Live Firebase Identity & Persistent PostgreSQL Profile'
              : isDemo
                ? 'Portfolio Demo Mode (Synthetic Candidate Persona)'
                : 'Dhaka & Regional Software Engineering Roles'}
          </span>
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
            fontSize: '0.75rem',
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
                <div className="brand-text">
                  seek<span>ers</span>
                </div>
              </div>

              {/* Desktop Workspace Tabs */}
              <nav
                className="workspace-tabs"
                style={{ display: 'flex' }}
                aria-label="Candidate Navigation"
              >
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
                  className={`tab-item ${activeTab === 'recommendations' ? 'active' : ''}`}
                  onClick={() => handleTabClick('recommendations')}
                  id="nav-tab-recommendations"
                >
                  Recommendations
                  {recommendationsCount !== undefined && recommendationsCount > 0 && (
                    <span className="tab-count">{recommendationsCount}</span>
                  )}
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
                  {applicationsCount > 0 && (
                    <span className="tab-count">{applicationsCount}</span>
                  )}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={onOpenFeedback}
                style={{ fontSize: '0.8125rem' }}
                id="nav-report-btn"
                title="Report a listing issue or platform feedback"
              >
                ⚑ Report
              </button>

              {/* Auth / Sync Status indicators */}
              {status === 'SYNCING' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--seekers-teal-dim)',
                    color: 'var(--seekers-teal-400)',
                    fontSize: '0.75rem',
                  }}
                >
                  <span className="live-pulse" style={{ width: '6px', height: '6px' }} />
                  <span>Syncing DB...</span>
                </div>
              )}

              {status === 'SYNC_ERROR' && (
                <button
                  type="button"
                  onClick={() => retrySync()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--seekers-danger-dim)',
                    color: 'var(--seekers-danger)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                  title="PostgreSQL sync failed. Click to retry."
                >
                  <span>⚠ Sync Failed (Retry)</span>
                </button>
              )}

              {/* Logged in or Demo Persona */}
              {displayName ? (
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    style={{
                      minHeight: '38px',
                      padding: '0.35rem 0.85rem',
                      fontSize: '0.8125rem',
                      borderColor: isDemo ? 'var(--seekers-amber-border)' : undefined,
                    }}
                    id="candidate-account-btn"
                  >
                    <span>{isDemo ? '🧪' : '👤'}</span>
                    <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName}
                    </span>
                    {user?.emailVerified && (
                      <span style={{ color: 'var(--seekers-teal-400)', fontSize: '0.75rem' }} title="Verified Candidate">
                        ✓
                      </span>
                    )}
                    <span style={{ fontSize: '0.7rem' }}>▼</span>
                  </button>

                  {/* Account Dropdown */}
                  {userDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '110%',
                        width: '220px',
                        backgroundColor: 'var(--seekers-bg-elevated)',
                        border: '1px solid var(--seekers-border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 100,
                        padding: '0.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      <div
                        style={{
                          padding: '0.5rem',
                          borderBottom: '1px solid var(--seekers-border-subtle)',
                          marginBottom: '0.25rem',
                        }}
                      >
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
                          {displayName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
                          {isDemo ? 'Portfolio Demo Persona' : user?.email}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => handleTabClick('profile')}
                        style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8125rem' }}
                      >
                        Profile & Preferences
                      </button>

                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          onOpenDataControl();
                        }}
                        style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.8125rem' }}
                      >
                        Privacy & Data Rights
                      </button>

                      <div style={{ borderTop: '1px solid var(--seekers-border-subtle)', margin: '0.25rem 0' }} />

                      {isDemo ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            exitDemoMode();
                            setUserDropdownOpen(false);
                          }}
                          style={{
                            width: '100%',
                            justifyContent: 'flex-start',
                            fontSize: '0.8125rem',
                            color: 'var(--seekers-amber-400)',
                          }}
                        >
                          Exit Demo Mode
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={async () => {
                            await signOut();
                            setUserDropdownOpen(false);
                          }}
                          style={{
                            width: '100%',
                            justifyContent: 'flex-start',
                            fontSize: '0.8125rem',
                            color: 'var(--seekers-danger)',
                          }}
                        >
                          Sign Out
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
          <div
            style={{
              backgroundColor: 'var(--seekers-bg-elevated)',
              borderTop: '1px solid var(--seekers-border-subtle)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
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
              className={`tab-item ${activeTab === 'recommendations' ? 'active' : ''}`}
              onClick={() => handleTabClick('recommendations')}
              style={{ width: '100%', justifyContent: 'flex-start', minHeight: '44px' }}
            >
              🎯 Recommendations {recommendationsCount !== undefined && recommendationsCount > 0 ? `(${recommendationsCount})` : ''}
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

            <button
              type="button"
              className="tab-item"
              onClick={() => {
                onOpenDataControl();
                setMobileMenuOpen(false);
              }}
              style={{ width: '100%', justifyContent: 'flex-start', minHeight: '44px' }}
            >
              🔒 Privacy & Data Rights
            </button>
          </div>
        )}
      </header>
    </>
  );
}
