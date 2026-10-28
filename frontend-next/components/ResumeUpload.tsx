'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function ResumeUpload() {
  const { user, token, isDemo, retrySync } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<'IDLE' | 'UPLOADING' | 'PROCESSING' | 'REVIEW' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [parseId, setParseId] = useState<string | null>(null);
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);

  const cleanupPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanupPolling();
  }, [cleanupPolling]);

  const pollParseStatus = useCallback(
    (targetParseId: string, authToken: string) => {
      cleanupPolling();
      pollCountRef.current = 0;

      pollingTimerRef.current = setInterval(async () => {
        pollCountRef.current += 1;

        // Bounded polling ceiling: 25 attempts x 1.5s = 37.5s max
        if (pollCountRef.current > 25) {
          cleanupPolling();
          setStage('ERROR');
          setError('Resume extraction timed out. Please try uploading again.');
          return;
        }

        try {
          const res = await fetch(`/api/v1/users/resume/status/${targetParseId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });

          if (!res.ok) {
            if (res.status === 404) {
              cleanupPolling();
              setStage('ERROR');
              setError('Resume parse task not found or unauthorized.');
            }
            return;
          }

          const data = await res.json();
          if (data.status === 'COMPLETED') {
            cleanupPolling();
            const skills: string[] = data.extracted_skills || [];
            setExtractedSkills(skills);
            setSelectedSkills(new Set(skills)); // Select all by default for candidate convenience
            setStage('REVIEW');
          } else if (data.status === 'FAILED') {
            cleanupPolling();
            setStage('ERROR');
            if (data.error_code === 'SCANNED_PDF_NO_TEXT') {
              setError('No selectable text layer found in document. Scanned PDFs are not supported under standard parsing.');
            } else if (data.error_code === 'ENCRYPTED_PDF') {
              setError('The PDF file is password protected. Please upload an unencrypted document.');
            } else {
              setError(data.error_message || 'Resume parsing could not be completed.');
            }
          }
        } catch {
          // Network hiccup: keep polling until timeout
        }
      }, 1500);
    },
    [cleanupPolling],
  );

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files[0];
    validateAndSetFile(dropped);
  };

  const validateAndSetFile = (candidateFile?: File | null) => {
    setError(null);
    if (!candidateFile) return;

    if (candidateFile.type !== 'application/pdf' && !candidateFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only digital text-layer PDF documents are supported.');
      return;
    }

    if (candidateFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds the maximum 10MB limit.');
      return;
    }

    setFile(candidateFile);
    setActiveFileName(candidateFile.name);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF resume file.');
      return;
    }

    setError(null);
    setStage('UPLOADING');

    // Portfolio Demonstration Mode Fallback
    if (isDemo || !user) {
      setTimeout(() => {
        setStage('REVIEW');
        const demoSkills = ['Go', 'Python', 'FastAPI', 'React', 'Docker', 'Kubernetes', 'PostgreSQL'];
        setExtractedSkills(demoSkills);
        setSelectedSkills(new Set(demoSkills));
      }, 1200);
      return;
    }

    try {
      const authToken = token || (await user.getIdToken());
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/v1/users/resume/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('File exceeds the 10MB upload ceiling.');
        }
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Upload failed with HTTP ${response.status}`);
      }

      const uploadData = await response.json();
      const newParseId = uploadData.parse_id;
      setParseId(newParseId);
      setStage('PROCESSING');

      // Start polling for async extraction results
      pollParseStatus(newParseId, authToken);
    } catch (err: unknown) {
      setStage('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'An error occurred during resume upload.');
    }
  };

  const handleToggleSkill = (skill: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
      return next;
    });
  };

  const handleApplySkills = async () => {
    if (selectedSkills.size === 0) {
      setError('Please select at least one skill to apply.');
      return;
    }

    setError(null);
    setApplying(true);

    if (isDemo || !user) {
      setTimeout(() => {
        setApplying(false);
        setStage('SUCCESS');
      }, 500);
      return;
    }

    try {
      const authToken = token || (await user.getIdToken());
      const response = await fetch('/api/v1/users/resume/review', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parse_id: parseId,
          selected_skills: Array.from(selectedSkills),
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save reviewed skills.');
      }

      // Refresh candidate profile in AuthContext
      await retrySync();
      setStage('SUCCESS');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to apply skills to profile.');
    } finally {
      setApplying(false);
    }
  };

  const handleDeleteResume = async () => {
    if (!confirm('Are you sure you want to remove your resume document?')) return;

    if (!isDemo && user) {
      try {
        const authToken = token || (await user.getIdToken());
        await fetch('/api/v1/users/resume', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` },
        });
        await retrySync();
      } catch {
        // Silently clear local UI
      }
    }

    setStage('IDLE');
    setFile(null);
    setActiveFileName(null);
    setParseId(null);
    setExtractedSkills([]);
    setSelectedSkills(new Set());
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--seekers-bg-surface)',
        border: '1px solid var(--seekers-border-medium)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        marginTop: '1.5rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>📄</span>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--seekers-text-primary)' }}>
              Candidate Resume & NLP Skill Extraction
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
              Upload your digital text-layer PDF (max 10MB). Extracted skills are staged for candidate review before profile enrichment.
            </p>
          </div>
        </div>

        {stage === 'SUCCESS' && (
          <button
            type="button"
            onClick={handleDeleteResume}
            style={{
              background: 'transparent',
              border: '1px solid var(--seekers-border-subtle)',
              borderRadius: 'var(--radius-xs)',
              padding: '0.35rem 0.65rem',
              color: 'var(--seekers-danger)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Remove Resume
          </button>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div
          style={{
            padding: '0.65rem 0.85rem',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--seekers-danger)',
            borderRadius: 'var(--radius-xs)',
            color: '#fca5a5',
            fontSize: '0.8125rem',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Stage: IDLE / Selecting File */}
      {stage === 'IDLE' && (
        <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleFileDrop}
            style={{
              border: `2px dashed ${dragActive ? 'var(--seekers-amber-500)' : 'var(--seekers-border-strong)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '1.75rem 1rem',
              textAlign: 'center',
              backgroundColor: dragActive ? 'rgba(245, 158, 11, 0.05)' : 'var(--seekers-bg-elevated)',
              cursor: 'pointer',
              display: 'block',
              transition: 'all 150ms ease',
            }}
          >
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => validateAndSetFile(e.target.files?.[0])}
              style={{ display: 'none' }}
              id="candidate-resume-file-input"
            />
            <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem', color: 'var(--seekers-amber-400)' }}>📎</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--seekers-text-primary)' }}>
              {file ? file.name : 'Choose a PDF resume or drop it here'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)', marginTop: '0.25rem' }}>
              {file ? `${(file.size / 1024).toFixed(1)} KB · Ready to upload` : 'Digital PDF only • 10MB limit'}
            </div>
          </label>

          <button
            type="submit"
            disabled={!file}
            className="btn-amber"
            style={{ alignSelf: 'flex-start', minHeight: '38px', padding: '0 1.25rem' }}
            id="candidate-resume-upload-btn"
          >
            Upload & Extract Skills
          </button>
        </form>
      )}

      {/* Stage: UPLOADING / PROCESSING */}
      {(stage === 'UPLOADING' || stage === 'PROCESSING') && (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem', animation: 'spin 1.5s linear infinite' }}>⚙️</div>
          <div style={{ fontWeight: 600, color: 'var(--seekers-text-primary)', marginBottom: '0.25rem' }}>
            {stage === 'UPLOADING' ? 'Uploading PDF to private storage...' : 'Extracting skills with spaCy NLP parser...'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--seekers-text-muted)' }}>
            {activeFileName} • Bounded background processing
          </div>
        </div>
      )}

      {/* Stage: REVIEW (Extracted Skills Checklist) */}
      {stage === 'REVIEW' && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--seekers-text-primary)', marginBottom: '0.25rem' }}>
              Review Extracted Skills ({extractedSkills.length})
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-secondary)' }}>
              Select the skills you want to add to your candidate profile. Unchecked skills will not be applied, and your existing manually entered skills are preserved.
            </p>
          </div>

          {extractedSkills.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--seekers-text-muted)', fontStyle: 'italic', marginBottom: '1rem' }}>
              No matching technical skills were identified in this document.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
              {extractedSkills.map((skill) => {
                const isSelected = selectedSkills.has(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => handleToggleSkill(skill)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.65rem',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      border: `1px solid ${isSelected ? 'var(--seekers-amber-500)' : 'var(--seekers-border-subtle)'}`,
                      backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'var(--seekers-bg-elevated)',
                      color: isSelected ? 'var(--seekers-amber-400)' : 'var(--seekers-text-secondary)',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{skill}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-amber"
              onClick={handleApplySkills}
              disabled={applying || selectedSkills.size === 0}
              style={{ minHeight: '38px', padding: '0 1.25rem' }}
            >
              {applying ? 'Applying...' : `Apply Selected (${selectedSkills.size}) to Profile`}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setStage('IDLE')}
              style={{ minHeight: '38px', padding: '0 1rem' }}
            >
              Cancel / Re-upload
            </button>
          </div>
        </div>
      )}

      {/* Stage: SUCCESS */}
      {stage === 'SUCCESS' && (
        <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span style={{ color: 'var(--seekers-success)', fontWeight: 700 }}>✓</span>
            <strong style={{ color: '#86efac', fontSize: '0.875rem' }}>Skills Applied Successfully</strong>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--seekers-text-secondary)', marginBottom: '0.75rem' }}>
            Your reviewed skills have been saved to your profile and will be used to personalize job recommendations.
          </p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setStage('IDLE')}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', minHeight: '32px' }}
          >
            Upload New Version
          </button>
        </div>
      )}

      {/* Stage: ERROR */}
      {stage === 'ERROR' && (
        <div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setStage('IDLE'); setError(null); }}
            style={{ fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
