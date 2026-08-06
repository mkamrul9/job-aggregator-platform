import AuthComponent from '../components/AuthComponent';
import ResumeUpload from '../components/ResumeUpload';
import JobSearch from '../components/JobSearch';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Job Aggregator Portal</h1>
        <p className="mt-4 text-lg text-gray-600">Find roles that match your actual skills.</p>
      </div>
      
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-8 px-4">
        {/* Left Column: User Management */}
        <div className="space-y-8">
          <AuthComponent />
          <ResumeUpload />
        </div>
        
        {/* Right Column: The Core Search Feature */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <JobSearch />
        </div>
      </div>
    </main>
  );
}
