import React, { useEffect, useState } from 'react';
import { useAuthStore, useThemeStore } from '../store';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ConfigModal from '../components/ConfigModal';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const [showConfig, setShowConfig] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('card');

  useEffect(() => {
    fetchProjects();
  }, []);

  if (!user) {
    setTimeout(() => navigate('/login'), 0);
    return null;
  }

  const fetchProjects = async () => {
    try {
      const res = await axios.get('/project');
      setProjects(res.data);
    } catch(e) {
      console.error(e);
    }
  };

  const createProject = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await axios.post('/project');
      navigate(`/project/${res.data.id}`);
    } catch(e) {
      alert("创建失败: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除这个项目吗？')) return;
    try {
      await axios.delete(`/project/${id}`);
      fetchProjects();
    } catch(e) {
      alert("删除失败: " + e.message);
    }
  };

  return (
    <div className="layout-wrapper">
      <nav className="navbar">
        <h2 style={{ color: 'var(--primary-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ✨ 智慧文案平台
        </h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }} className="hide-on-mobile">已登入：{user.username}</span>
          <button className="btn" onClick={toggleTheme} style={{ width: '38px', height: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', borderRadius: '8px' }} title="切换夜间模式">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="btn" onClick={() => setShowConfig(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>⚙️ 配置</button>
          <button className="btn btn-danger" onClick={logout} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>退出</button>
        </div>
      </nav>

      <div className="container" style={{ flex: 1, padding: '3rem 2rem', maxWidth: '1200px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0 }}>全部创作项目</h2>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--card-bg)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <button 
               onClick={() => setViewMode('card')} 
               style={{ 
                 background: viewMode === 'card' ? 'var(--primary-color)' : 'transparent', 
                 color: viewMode === 'card' ? 'white' : 'var(--text-muted)',
                 border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, transition: 'all 0.2s'
               }}
            >
               🔲 卡片
            </button>
            <button 
               onClick={() => setViewMode('list')} 
               style={{ 
                 background: viewMode === 'list' ? 'var(--primary-color)' : 'transparent', 
                 color: viewMode === 'list' ? 'white' : 'var(--text-muted)',
                 border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, transition: 'all 0.2s'
               }}
            >
               📄 列表
            </button>
          </div>
        </div>
        
        {viewMode === 'card' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', justifyContent: 'flex-start' }}>
            <div 
               onClick={createProject}
               style={{ 
                 flex: '0 0 300px', width: '300px', maxWidth: '100%',
                 border: '2px dashed var(--primary-color)', 
                 borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                 padding: '2rem', minHeight: '180px', cursor: 'pointer', color: 'var(--primary-color)',
                 opacity: loading ? 0.5 : 1, pointerEvents: loading ? 'none':'auto', transition: 'all 0.2s', background: 'var(--card-bg)'
               }}
            >
              <span style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>+</span>
              <span style={{ fontWeight: 600 }}>新建空白创作</span>
            </div>

            {projects.map(p => (
              <div 
                key={p.id} className="card" onClick={() => navigate(`/project/${p.id}`)}
                style={{ flex: '0 0 300px', width: '300px', maxWidth: '100%', cursor: 'pointer', margin: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', padding: '1.5rem', minHeight: '180px' }}
              >
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', paddingRight: '20px' }}>
                  {p.topic}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  {p.status === 'COMPLETED' ? '✅ 已完稿' : p.status === 'OUTLINE_DONE' ? '📝 大纲阶段' : '草稿态'}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 'auto', paddingTop: '1rem' }}>
                  最后打开: {new Date(p.updated_at).toLocaleString()}
                </p>
                <button 
                  onClick={(e) => deleteProject(e, p.id)}
                  style={{ position: 'absolute', top: '10px', right: '10px', border: 'none', background: 'transparent', color: 'var(--danger-color)', cursor: 'pointer', padding: '0.5rem', fontSize: '1.1rem', opacity: 0.6 }}
                  title="删除项目"
                >🗑️</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: 'auto', margin: 0, WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap', minWidth: '1000px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-color)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '1rem 1.5rem' }}>写作主题</th>
                  <th style={{ padding: '1rem' }}>创作阶段</th>
                  <th style={{ padding: '1rem' }}>最后活跃时间</th>
                  <th style={{ padding: '1rem', width: '200px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td colSpan="4" style={{ padding: '1rem 1.5rem' }}>
                    <button onClick={createProject} className="btn btn-primary" style={{ padding: '0.5rem 1.5rem', borderRadius: '100px' }}>+ 新建一篇创作</button>
                  </td>
                </tr>
                {projects.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s', ':hover': {background: 'rgba(0,0,0,0.02)'} }}>
                    <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>{p.topic}</td>
                    <td style={{ padding: '1rem' }}>
                       {p.status === 'COMPLETED' ? <span style={{color: '#10b981', fontWeight: 600}}>✅ 已保存成稿</span> : p.status === 'OUTLINE_DONE' ? <span style={{color: '#3b82f6'}}>📝 骨架成型</span> : <span style={{color: 'var(--text-muted)'}}>草稿筹备中</span>}
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(p.updated_at).toLocaleString()}</td>
                    <td style={{ padding: '1rem' }}>
                      <button onClick={() => navigate(`/project/${p.id}`)} className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', marginRight: '0.5rem' }}>进入画板</button>
                      <button onClick={(e) => deleteProject(e, p.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger-color)', cursor: 'pointer', padding: '0.4rem', fontSize: '1rem' }} title="完全粉碎">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
      
      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} />}
    </div>
  );
}
