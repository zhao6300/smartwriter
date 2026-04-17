import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuthStore } from '../store';

export default function AdminLogin() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Admin bypass trick - if registering 'admin', backend auto elevates
      // We will try to just login. If backend says not exists, might need normal register page.
      // But we just provide Login here per guidelines.
      const { data } = await axios.post('/auth/login', { username, password });
      
      if (!data.user.is_admin) {
        alert("ACCESS DENIED: 您不是超级节点。");
        return;
      }
      setAuth(data.user, data.token);
      navigate('/admin');
    } catch (err) {
      alert('连接失败: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="layout-wrapper" style={{ justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', color: '#10b981' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', backgroundColor: '#1e293b', border: '1px solid #334155' }}>
        <h2 style={{ textAlign: 'center', color: '#10b981', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '2rem' }}>
          管理员页面
        </h2>
        <form onSubmit={handleSubmit}>
          <div>
             <input type="text" value={username} onChange={e => setUsername(e.target.value)} required placeholder="ROOT ID" style={{ background: '#0f172a', color: '#10b981', border: '1px solid #334155', outline: 'none' }} />
          </div>
          <div>
             <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="PASSWORD" style={{ background: '#0f172a', color: '#10b981', border: '1px solid #334155', outline: 'none' }} />
          </div>
          <button type="submit" className="btn" style={{ width: '100%', marginTop: '1.5rem', background: '#10b981', color: '#0f172a', fontWeight: 'bold', fontSize: '1.1rem', letterSpacing: '1px' }}>
            INITIATE LINK
          </button>
        </form>
      </div>
    </div>
  );
}
