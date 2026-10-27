'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth-context';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signIn, signUp, sendPasswordReset, activateDemoMode, isEmulator } = useAuth();

  const [tab, setTab] = useState<'signin' | 'register' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    emailInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, tab]);

  if (!isOpen) return null;

  const handleQuickFill = () => {
    setEmail('farhan.ahmed@example.com');
    setPassword('CandidatePass2026!');
    setName('Farhan Ahmed');
    setLocalError('');
  };

  const handleDemoModeClick = () => {
    activateDemoMode();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setSuccessMsg('');

    if (!email.includes('@') || !email.includes('.')) {
      setLocalError('Please provide a valid candidate email address.');
      return;
    }

    if (tab === 'forgot') {
      setLoading(true);
      try {
        await sendPasswordReset(email);
        setSuccessMsg(
          'If an account is associated with this email address, a password reset link has been dispatched.',
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setLocalError(msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must contain at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'signin') {
        await signIn(email, password);
        setSuccessMsg('Session authenticated. Loading workspace...');
      } else {
        await signUp(email, password, name || 'New Candidate');
        setSuccessMsg('Account registered and synchronized! Verification email sent.');
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="modal-dialog">
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--seekers-border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              className="brand-mark"
              style={{ width: '24px', height: '24px', fontSize: '12px' }}
            >
              S
            </div>
            <h2
              id="auth-modal-title"
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--seekers-text-primary)',
              }}
            >
              {tab === 'signin'
                ? 'Candidate Sign In'
                : tab === 'register'
                  ? 'Create Candidate Account'
                  : 'Reset Password'}
            </h2>
          </div>

          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            style={{ width: '32px', height: '32px', minHeight: '32px', padding: 0 }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Real Auth Status Pill */}
        <div
          style={{
            backgroundColor: isEmulator ? '#064e3b' : '#131b2c',
            border: isEmulator
              ? '1px solid rgba(16, 185, 129, 0.4)'
              : '1px solid var(--seekers-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.85rem',
            marginBottom: '1rem',
            fontSize: '0.75rem',
            color: 'var(--seekers-text-secondary)',
            lineHeight: 1.4,
          }}
        >
          {isEmulator ? (
            <span>
              <strong style={{ color: '#34d399' }}>Firebase Auth Emulator Active:</strong> Local
              development mode connected to port 9099. Real authentication with PostgreSQL persistence.
            </span>
          ) : (
            <span>
              <strong style={{ color: 'var(--seekers-teal-400)' }}>Production Firebase Identity:</strong>{' '}
              Authenticates with Firebase and idempotently synchronizes profile to PostgreSQL.
            </span>
          )}
        </div>

        {/* Tab Toggle */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--seekers-bg-surface)',
            padding: '0.25rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            style={{
              flex: 1,
              minHeight: '36px',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              background: tab === 'signin' ? 'var(--seekers-bg-elevated)' : 'transparent',
              color: tab === 'signin' ? 'var(--seekers-text-primary)' : 'var(--seekers-text-secondary)',
              fontWeight: tab === 'signin' ? 600 : 500,
              cursor: 'pointer',
              fontSize: '0.8125rem',
            }}
            onClick={() => {
              setTab('signin');
              setLocalError('');
              setSuccessMsg('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              minHeight: '36px',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              background: tab === 'register' ? 'var(--seekers-bg-elevated)' : 'transparent',
              color: tab === 'register' ? 'var(--seekers-text-primary)' : 'var(--seekers-text-secondary)',
              fontWeight: tab === 'register' ? 600 : 500,
              cursor: 'pointer',
              fontSize: '0.8125rem',
            }}
            onClick={() => {
              setTab('register');
              setLocalError('');
              setSuccessMsg('');
            }}
          >
            Create Account
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              minHeight: '36px',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              background: tab === 'forgot' ? 'var(--seekers-bg-elevated)' : 'transparent',
              color: tab === 'forgot' ? 'var(--seekers-text-primary)' : 'var(--seekers-text-secondary)',
              fontWeight: tab === 'forgot' ? 600 : 500,
              cursor: 'pointer',
              fontSize: '0.8125rem',
            }}
            onClick={() => {
              setTab('forgot');
              setLocalError('');
              setSuccessMsg('');
            }}
          >
            Reset
          </button>
        </div>

        {/* Quick Fill Helper */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
            Need testing credentials?
          </span>
          <button
            type="button"
            onClick={handleQuickFill}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--seekers-teal-400)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Quick-fill credentials
          </button>
        </div>

        {/* Error / Success Banners */}
        {localError && (
          <div
            style={{
              backgroundColor: 'var(--seekers-danger-dim)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: 'var(--seekers-danger)',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              marginBottom: '1rem',
              lineHeight: 1.4,
            }}
          >
            {localError}
          </div>
        )}

        {successMsg && (
          <div
            style={{
              backgroundColor: 'var(--seekers-teal-dim)',
              border: '1px solid rgba(14, 165, 233, 0.4)',
              color: 'var(--seekers-teal-400)',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              marginBottom: '1rem',
              lineHeight: 1.4,
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tab === 'register' && (
            <div>
              <label
                htmlFor="auth-name-input"
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--seekers-text-secondary)',
                  marginBottom: '0.35rem',
                }}
              >
                Full Name
              </label>
              <input
                id="auth-name-input"
                type="text"
                className="filter-select"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="e.g. Farhan Ahmed"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={tab === 'register'}
                disabled={loading}
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email-input"
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 500,
                color: 'var(--seekers-text-secondary)',
                marginBottom: '0.35rem',
              }}
            >
              Candidate Email
            </label>
            <input
              ref={emailInputRef}
              id="auth-email-input"
              type="email"
              className="filter-select"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          {tab !== 'forgot' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.35rem',
                }}
              >
                <label
                  htmlFor="auth-password-input"
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: 'var(--seekers-text-secondary)',
                  }}
                >
                  Password
                </label>
                {tab === 'signin' && (
                  <button
                    type="button"
                    onClick={() => setTab('forgot')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--seekers-text-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password-input"
                type="password"
                className="filter-select"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : tab === 'signin' ? (
              'Sign In with Firebase'
            ) : tab === 'register' ? (
              'Register & Sync Profile'
            ) : (
              'Send Password Reset Link'
            )}
          </button>
        </form>

        {/* Distinct Demo Mode Boundary */}
        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--seekers-border-subtle)',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--seekers-text-muted)',
              marginBottom: '0.65rem',
            }}
          >
            Prefer to explore without creating a real account?
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleDemoModeClick}
            style={{
              width: '100%',
              justifyContent: 'center',
              fontSize: '0.8125rem',
              borderColor: 'var(--seekers-amber-border)',
              color: 'var(--seekers-amber-400)',
            }}
          >
            🚀 Explore Portfolio Demo (Farhan Ahmed - Synthetic Data)
          </button>
        </div>
      </div>
    </div>
  );
}
