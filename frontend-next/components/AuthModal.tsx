'use client';

import React, { useState, useEffect, useRef } from 'react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (name: string, email: string) => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  onLoginSuccess
}: AuthModalProps) {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleQuickFill = () => {
    setEmail('farhan.ahmed@example.com');
    setPassword('DemoPass2026!');
    setName('Farhan Ahmed');
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.includes('@') || !email.includes('.')) {
      setError('Please provide a valid candidate email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    // Prototyped session login
    setSuccessMsg('Candidate session authenticated. Transitioning to workspace...');
    setTimeout(() => {
      onLoginSuccess(name || 'Farhan Ahmed', email);
      onClose();
      setSuccessMsg('');
    }, 600);
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--seekers-border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="brand-mark" style={{ width: '24px', height: '24px', fontSize: '12px' }}>S</div>
            <h2 id="auth-modal-title" style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.15rem',
              fontWeight: 700,
              color: 'var(--seekers-text-primary)'
            }}>
              {tab === 'signin' ? 'Candidate Sign In' : 'Create Candidate Account'}
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

        {/* Prototype Disclaimer */}
        <div style={{
          backgroundColor: '#131b2c',
          border: '1px solid var(--seekers-amber-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.65rem 0.85rem',
          marginBottom: '1rem',
          fontSize: '0.75rem',
          color: 'var(--seekers-text-secondary)',
          lineHeight: 1.4
        }}>
          <strong style={{ color: 'var(--seekers-amber-400)' }}>Prototype Auth Mode:</strong> Validates candidate form fields and activates local session state. Production Firebase Auth integration is governed by Phase 5.
        </div>

        {/* Tab Toggle */}
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--seekers-bg-surface)',
          padding: '0.25rem',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '1.25rem'
        }}>
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
              fontSize: '0.8125rem'
            }}
            onClick={() => setTab('signin')}
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
              fontSize: '0.8125rem'
            }}
            onClick={() => setTab('register')}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: 'var(--seekers-danger-dim)',
            border: '1px solid var(--seekers-danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--seekers-danger)',
            fontSize: '0.8125rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{
            padding: '0.5rem 0.75rem',
            backgroundColor: 'var(--seekers-success-dim)',
            border: '1px solid var(--seekers-success)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--seekers-success)',
            fontSize: '0.8125rem',
            marginBottom: '1rem'
          }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                className="input-text"
                type="text"
                placeholder="Farhan Ahmed"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email Address</label>
            <input
              ref={emailInputRef}
              id="auth-email"
              className="input-text"
              type="email"
              placeholder="farhan@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="auth-password">Password</label>
              {tab === 'signin' && (
                <span style={{ fontSize: '0.75rem', color: 'var(--seekers-amber-400)', cursor: 'pointer' }}>
                  Forgot password?
                </span>
              )}
            </div>
            <input
              id="auth-password"
              className="input-text"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', minHeight: '44px', marginTop: '0.5rem', marginBottom: '0.75rem' }}
          >
            {tab === 'signin' ? 'Sign In to Workspace' : 'Create Free Account'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleQuickFill}
            style={{ width: '100%', minHeight: '38px', fontSize: '0.8125rem' }}
          >
            ⚡ Quick Fill: Demo Candidate (Farhan Ahmed)
          </button>
        </form>

      </div>
    </div>
  );
}
