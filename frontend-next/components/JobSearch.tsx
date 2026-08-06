'use client';

import { useState } from 'react';

// Define the shape of our data
interface Job {
  title: string;
  company: string;
  url: string;
  raw_description?: string;
}

export default function JobSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to fetch jobs', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 mt-8">
      <form onSubmit={handleSearch} className="flex gap-4 mb-8">
        <input
          type="text"
          placeholder="Search for roles (e.g., React, Go, Docker)..."
          className="flex-1 border-2 border-gray-300 p-4 rounded-lg text-lg text-black focus:outline-none focus:border-blue-500 transition-colors"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button 
          type="submit" 
          disabled={loading}
          className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div className="grid gap-6">
        {jobs.map((job, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <h2 className="text-2xl font-bold text-gray-900">{job.title}</h2>
            <h3 className="text-lg text-gray-600 mt-1">{job.company}</h3>
            {/* Truncate the massive raw description for the UI */}
            <p className="text-gray-500 mt-4 line-clamp-3">
              {job.raw_description || "No description provided."}
            </p>
            <a 
              href={job.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block mt-4 text-blue-600 font-medium hover:underline"
            >
              View Application &rarr;
            </a>
          </div>
        ))}
        {!loading && jobs.length === 0 && searchTerm && (
          <p className="text-center text-gray-500">No jobs found matching your criteria.</p>
        )}
      </div>
    </div>
  );
}
