'use client';

import { useState } from 'react';
import { auth } from '../lib/firebase';

export default function ResumeUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !auth.currentUser) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('resume', file);

    try {
      const token = await auth.currentUser.getIdToken();
      
      // This endpoint hits NestJS. NestJS will then call FastAPI via gRPC.
      const response = await fetch('http://localhost/api/users/profile/resume', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // Do NOT set Content-Type here; the browser sets it automatically with the boundary for FormData
        },
        body: formData,
      });

      const data = await response.json();
      if (data.skills) {
        setSkills(data.skills);
      }
    } catch (error) {
      console.error('Upload failed', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8 max-w-lg mx-auto mt-10 bg-gray-50 border rounded-lg">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Upload Your Resume</h3>
      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        <input 
          type="file" 
          accept="application/pdf" 
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <button 
          type="submit" 
          disabled={!file || uploading}
          className="bg-indigo-600 text-white py-2 rounded-md disabled:bg-gray-400"
        >
          {uploading ? 'Processing AI Extraction...' : 'Upload & Parse'}
        </button>
      </form>

      {skills.length > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold text-green-700">Extracted Skills:</h4>
          <div className="flex flex-wrap gap-2 mt-2">
            {skills.map((skill) => (
              <span key={skill} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
