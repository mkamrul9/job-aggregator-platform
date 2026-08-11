'use client';

import { useState } from 'react';
import { auth } from '../lib/firebase';

export default function ResumeUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please select a PDF file first.'); return; }
    if (!auth.currentUser) { setError('Please log in before uploading.'); return; }

    setError('');
    setUploading(true);
    const formData = new FormData();
    formData.append('resume', file);

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('http://localhost/api/users/profile/resume', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.skills) setSkills(data.skills);
    } catch (err) {
      console.error('Upload failed', err);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === 'application/pdf') setFile(dropped);
    else setError('Only PDF files are supported.');
  };

  return (
    <div>
      <div className="card-title">
        <div className="card-icon">📄</div>
        AI Resume Parser
      </div>

      <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <label
          className={`upload-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          id="resume-upload-zone"
        >
          <div className="upload-icon-wrap">
            {file ? (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M4 12l5 5L18 6" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 15V7M7 10l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </div>

          {file ? (
            <>
              <span className="upload-label">
                <strong style={{ color: 'var(--success)' }}>✓ {file.name}</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {(file.size / 1024).toFixed(0)} KB · Ready to parse
              </span>
            </>
          ) : (
            <>
              <span className="upload-label">
                <strong>Drop your PDF here</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                or click to browse · PDF only
              </span>
            </>
          )}
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ display: 'none' }}
            id="resume-file-input"
          />
        </label>

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

        <button
          type="submit"
          disabled={!file || uploading}
          className="btn-amber"
          style={{ width: '100%' }}
          id="resume-parse-btn"
        >
          {uploading ? (
            <span className="loading-pulse">Extracting skills with AI...</span>
          ) : (
            <>
              Parse Resume
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v6M4 4l3-3 3 3M2 10h10M2 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </>
          )}
        </button>
      </form>

      {skills.length > 0 && (
        <div className="fade-up" style={{ marginTop: '1.5rem' }}>
          <div className="divider" />
          <div className="section-label">Extracted Skills ({skills.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
            {skills.map((skill) => (
              <span key={skill} className="skill-tag">✓ {skill}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
