import AuthComponent from '../components/AuthComponent';
import ResumeUpload from '../components/ResumeUpload';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Job Aggregator Portal</h1>
        <p className="mt-4 text-lg text-gray-600">Find roles that match your actual skills.</p>
      </div>
      
      <AuthComponent />
      <ResumeUpload />
    </main>
  );
}
