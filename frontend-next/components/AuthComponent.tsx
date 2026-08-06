'use client';

import { useState } from 'react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

export default function AuthComponent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const syncUserWithBackend = async (token: string) => {
    try {
      // Notice we are calling the Nginx API Gateway endpoint on port 80!
      // Nginx will forward this to the NestJS User Service.
      const response = await fetch('http://localhost/api/users/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log('User successfully synced with PostgreSQL!');
      }
    } catch (error) {
      console.error('Failed to sync user', error);
    }
  };

  const handleAuth = async (isSignUp: boolean) => {
    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }
      
      // Get the JWT to send to NestJS
      const token = await userCredential.user.getIdToken();
      await syncUserWithBackend(token);
      
    } catch (error) {
      console.error('Authentication Error:', error);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-8 max-w-md mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-2xl font-bold text-gray-800">Candidate Login</h2>
      <input 
        type="email" 
        placeholder="Email" 
        className="border p-2 rounded text-black"
        onChange={(e) => setEmail(e.target.value)} 
      />
      <input 
        type="password" 
        placeholder="Password" 
        className="border p-2 rounded text-black"
        onChange={(e) => setPassword(e.target.value)} 
      />
      <button onClick={() => handleAuth(false)} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700">Login</button>
      <button onClick={() => handleAuth(true)} className="bg-green-600 text-white p-2 rounded hover:bg-green-700">Sign Up</button>
    </div>
  );
}
