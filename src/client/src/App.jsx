import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Workspace from './pages/Workspace';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  const user = useAuthStore(state => state.user);

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={user ? <Dashboard /> : <Navigate to="/login" />} />
      <Route path="/project/:id" element={user ? <Workspace /> : <Navigate to="/login" />} />
      <Route path="/admin/login" element={user?.is_admin ? <Navigate to="/admin" /> : <AdminLogin />} />
      <Route path="/admin" element={user?.is_admin ? <AdminDashboard /> : <Navigate to="/admin/login" />} />
    </Routes>
  );
}

export default App;
