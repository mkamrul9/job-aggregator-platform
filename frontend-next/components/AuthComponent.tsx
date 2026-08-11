'use client';

import { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

export default function AuthComponent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const syncUserWithBackend = async (token: string) => {
    try {
      const response = await fetch('http://localhost/api/users/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        console.log('User synced with PostgreSQL');
      }
    } catch (err) {
      console.error('Failed to sync user', err);
    }
  };

  const handleAuth = async (isSignUp: boolean) => {
    setError('');
    setSuccess('');
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    try {
      let credential;
      if (isSignUp) {
        credential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        credential = await signInWithEmailAndPassword(auth, email, password);
      }
      const token = await credential.user.getIdToken();
      await syncUserWithBackend(token);
      setSuccess(isSignUp ? 'Account created! Welcome to Seekers.' : `Welcome back!`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    }
  };

  return (
    <div>
      <div className="card-title">
        <div className="card-icon">👤</div>
        Sign in to Seekers
      </div>

      <div className="flex-col" style={{ gap: '0.75rem' }}>
        <div>
          <label className="form-label">Email address</label>
          <input
            type="email"
            placeholder="you@example.com"
            className="s-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            id="auth-email-input"
          />
        </div>

        <div>
          <label className="form-label">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            className="s-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            id="auth-password-input"
          />
        </div>

        {error && (
          <div style={{
            padding: '0.65rem 0.875rem',
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 'var(--r-md)',
            color: 'var(--danger)',
            fontSize: '0.8125rem',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: '0.65rem 0.875rem',
            background: 'var(--success-dim)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 'var(--r-md)',
            color: 'var(--success)',
            fontSize: '0.8125rem',
          }}>
            {success}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
          <button
            onClick={() => handleAuth(false)}
            className="btn-amber"
            id="login-btn"
          >
            Login
          </button>
          <button
            onClick={() => handleAuth(true)}
            className="btn-ghost"
            id="signup-btn"
          >
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}
