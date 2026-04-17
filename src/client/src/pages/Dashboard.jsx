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
  const [logs, setLogs] = useState([]);
  
  // Knowledge Base State
  const [kbs, setKbs] = useState([]);
  const [activeKb, setActiveKb] = useState(null);
  const [kbDocs, setKbDocs] = useState([]);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDesc, setNewKbDesc] = useState('');
  const [kbTextInputs, setKbTextInputs] = useState({});

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (viewMode === 'log') {
      fetchLogs();
    } else if (viewMode === 'kb') {
      fetchKbs();
      setActiveKb(null);
    }
  }, [viewMode]);

  const fetchKbs = async () => {
    try {
      const res = await axios.get('/kb');
      setKbs(res.data);
    } catch(e) {
      console.error(e);
    }
  };

  const fetchKbDocs = async (kbId) => {
    try {
      const res = await axios.get(`/kb/${kbId}/docs`);
      setKbDocs(res.data);
    } catch(e) {
      console.error(e);
    }
  };

  const handleCreateKb = async (e) => {
    e.preventDefault();
    if(!newKbName.trim()) return;
    try {
      await axios.post('/kb', { name: newKbName, description: newKbDesc });
      setNewKbName('');
      setNewKbDesc('');
      fetchKbs();
    } catch(e) {
      alert("创建知识库失败：" + e.message);
    }
  };

  const handleDeleteKb = async (e, id) => {
    e.stopPropagation();
    if(!window.confirm("确定要永久删除此知识库及其内部资料吗？")) return;
    try {
      await axios.delete(`/kb/${id}`);
      if (activeKb?.id === id) setActiveKb(null);
      fetchKbs();
    } catch(e) {
      alert("删除失败：" + e.message);
    }
  };

  const handleAddKbText = async (kbId) => {
    const text = kbTextInputs[kbId] || '';
    if(!text.trim()) return;
    try {
      await axios.post(`/kb/${kbId}/docs/text`, { content: text });
      setKbTextInputs(prev => ({ ...prev, [kbId]: '' }));
      fetchKbDocs(kbId);
    } catch(e) {
      alert("上传文本段落失败: " + e.message);
    }
  };

  const handleAddKbImage = async (kbId, fileList) => {
    if(!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if(file.size > 10 * 1024 * 1024) {
      alert('请上传 10MB 以内的图片');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Url = e.target.result;
      try {
        await axios.post(`/kb/${kbId}/docs/image`, { url: base64Url });
        fetchKbDocs(kbId);
      } catch(err) {
        alert("上传图像文件失败: " + err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteKbDoc = async (kbId, docId) => {
    try {
      await axios.delete(`/kb/${kbId}/docs/${docId}`);
      fetchKbDocs(kbId);
      fetchKbs(); // to update count
    } catch(e) {
      alert("删除文档失败: " + e.message);
    }
  };

  const openKbDetails = (kb) => {
    setActiveKb(kb);
    fetchKbDocs(kb.id);
  };

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

  const fetchLogs = async () => {
    try {
      const res = await axios.get('/logs?global=true');
      setLogs(res.data);
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
    <div className="layout-wrapper" style={{ display: 'flex', height: '100vh', overflow: 'hidden', flexDirection: 'row' }}>
      
      {/* Left Sidebar Menu */}
      <aside style={{ width: '260px', background: 'var(--card-bg)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '1.75rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ color: 'var(--primary-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.25rem' }}>
            ✨ 智慧文案平台
          </h2>
        </div>
        
        <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button 
             onClick={() => setViewMode('card')} 
             style={{ 
               background: (viewMode === 'card' || viewMode === 'list') ? 'var(--primary-color)' : 'transparent', 
               color: (viewMode === 'card' || viewMode === 'list') ? 'white' : 'var(--text-muted)',
               border: 'none', padding: '0.8rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, transition: 'all 0.2s', textAlign: 'left'
             }}
          >
             📝 文档创作
          </button>
          <button 
             onClick={() => setViewMode('kb')} 
             style={{ 
               background: viewMode === 'kb' ? 'var(--primary-color)' : 'transparent', 
               color: viewMode === 'kb' ? 'white' : 'var(--text-muted)',
               border: 'none', padding: '0.8rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, transition: 'all 0.2s', textAlign: 'left'
             }}
          >
             📚 知识库资料
          </button>
          <button 
             onClick={() => setViewMode('log')} 
             style={{ 
               background: viewMode === 'log' ? 'var(--primary-color)' : 'transparent', 
               color: viewMode === 'log' ? 'white' : 'var(--text-muted)',
               border: 'none', padding: '0.8rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600, transition: 'all 0.2s', textAlign: 'left'
             }}
          >
             📜 全局操作日志
          </button>
        </nav>
        
        {/* User Status / Settings */}
        <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', padding: '0 0.5rem' }}>
            👤 当前登入: <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{user.username}</span>
          </div>
          <button onClick={() => setShowConfig(true)} style={{ textAlign: 'left', padding: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', borderRadius: '6px', fontSize: '0.9rem' }}>
            ⚙️ 个人设置
          </button>
          <button onClick={toggleTheme} style={{ textAlign: 'left', padding: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', borderRadius: '6px', fontSize: '0.9rem' }}>
            {theme === 'dark' ? '☀️ 切换日间模式' : '🌙 切换夜间模式'}
          </button>
          <button onClick={logout} style={{ textAlign: 'left', padding: '0.5rem', background: 'transparent', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', borderRadius: '6px', fontSize: '0.9rem' }}>
            🚪 退出登录
          </button>
        </div>
      </aside>

      {/* Right Content Area */}
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-color)', padding: '2.5rem 3rem' }}>
        
        {/* Only show the top header controls if we are in documents view */}
        {(viewMode === 'card' || viewMode === 'list') && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.8rem' }}>全部创作项目</h2>
            <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--card-bg)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <button 
                 onClick={() => setViewMode('card')} 
                 style={{ 
                   background: viewMode === 'card' ? 'var(--primary-color)' : 'transparent', 
                   color: viewMode === 'card' ? 'white' : 'var(--text-muted)',
                   border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s'
                 }}
              >
                 🔲 卡片
              </button>
              <button 
                 onClick={() => setViewMode('list')} 
                 style={{ 
                   background: viewMode === 'list' ? 'var(--primary-color)' : 'transparent', 
                   color: viewMode === 'list' ? 'white' : 'var(--text-muted)',
                   border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s'
                 }}
              >
                 📄 列表
              </button>
            </div>
          </div>
        )}
        
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
        ) : viewMode === 'list' ? (
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
        ) : null}
        
        {viewMode === 'log' && (
          <div className="card" style={{ padding: '0', overflow: 'hidden', margin: 0 }}>
            <div style={{ background: 'var(--code-bg)', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
               <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>近期活动时光轴</h3>
            </div>
            <div style={{ padding: '1.5rem', maxHeight: '600px', overflowY: 'auto' }}>
              {logs.length === 0 ? (
                 <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>暂无操作痕迹</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {logs.map((L, i) => (
                    <div key={L.id} style={{ display: 'flex', gap: '1.5rem', position: 'relative' }}>
                       {i !== logs.length - 1 && <div style={{ position: 'absolute', left: '16px', top: '30px', bottom: '-20px', width: '2px', background: 'var(--border-color)', zIndex: 1 }} />}
                       
                       <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--code-bg)', border: '2px solid var(--primary-color)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                         <span style={{ fontSize: '0.8rem' }}>📌</span>
                       </div>
                       
                       <div style={{ background: 'var(--code-bg)', padding: '1rem', borderRadius: '12px', flex: 1, border: '1px solid var(--border-color)' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                           <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>{L.action}</h4>
                           <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(L.created_at).toLocaleString()}</span>
                         </div>
                         {L.details && (
                           <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                             {L.details}
                           </p>
                         )}
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === 'kb' && (
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
            
            {/* KB List Sidebar */}
            <div style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card" style={{ margin: 0, padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem' }}>➕ 创建知识库</h3>
                <form onSubmit={handleCreateKb} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input value={newKbName} onChange={e=>setNewKbName(e.target.value)} placeholder="知识库名称" style={{ padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-color)', color: 'var(--text-main)', outline: 'none' }} />
                  <textarea value={newKbDesc} onChange={e=>setNewKbDesc(e.target.value)} placeholder="简短描述..." style={{ padding: '0.6rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-color)', color: 'var(--text-main)', outline: 'none', resize: 'vertical' }} />
                  <button type="submit" className="btn btn-primary">新建</button>
                </form>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {kbs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', margin: '1rem 0' }}>暂无知识库资产</p>}
                {kbs.map(kb => (
                  <div key={kb.id} onClick={() => openKbDetails(kb)} style={{ padding: '1rem', background: activeKb?.id === kb.id ? 'var(--code-bg)' : 'var(--card-bg)', border: activeKb?.id === kb.id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--primary-color)' }}>{kb.name}</h4>
                      <button onClick={(e) => handleDeleteKb(e, kb.id)} style={{ border: 'none', background: 'transparent', color: 'var(--danger-color)', cursor: 'pointer', opacity: 0.6 }} title="删除">🗑</button>
                    </div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{kb.description || '无介绍'}</p>
                    <span style={{ fontSize: '0.75rem', background: 'var(--border-color)', padding: '0.1rem 0.5rem', borderRadius: '100px', color: 'var(--text-muted)' }}>含 {kb._count?.documents || 0} 份资料</span>
                  </div>
                ))}
              </div>
            </div>

            {/* KB Details Panel */}
            <div style={{ flex: 1 }}>
              {activeKb ? (
                <div className="card" style={{ margin: 0, minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>📚 {activeKb.name}</h2>
                    <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{activeKb.description}</p>
                  </div>

                  {/* Add document controls */}
                  <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--code-bg)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    
                    <div>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>输入文字片段</h4>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <textarea 
                          value={kbTextInputs[activeKb.id] || ''} 
                          onChange={e => setKbTextInputs(prev => ({ ...prev, [activeKb.id]: e.target.value }))}
                          placeholder="粘贴段落、文章或任何文本资料..."
                          style={{ flex: 1, padding: '0.5rem', height: '60px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-color)', color: 'var(--text-main)', resize: 'none' }}
                        />
                        <button onClick={() => handleAddKbText(activeKb.id)} className="btn btn-primary" style={{ padding: '0 1rem' }}>保存内容</button>
                      </div>
                    </div>

                    <div>
                      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>喂给视觉模型图像</h4>
                      <div style={{ border: '1px dashed var(--border-color)', borderRadius: '6px', padding: '1rem', textAlign: 'center', background: 'var(--bg-color)', position: 'relative' }}>
                        <input type="file" accept="image/*" onChange={(e) => handleAddKbImage(activeKb.id, e.target.files)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                        <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>🖼</span>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>点击或拖拽图片到此 (≤10MB)</p>
                      </div>
                    </div>

                  </div>

                  <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
                    <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>内置素材库 ({kbDocs.length})</h3>
                    {kbDocs.length === 0 && <p style={{ color: 'var(--text-muted)' }}>该库尚无资料，请从上方录入。</p>}
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                      {kbDocs.map(doc => (
                        <div key={doc.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                          <div style={{ background: 'var(--code-bg)', padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{doc.type === 'IMAGE' ? '🖼 图像资料' : '📝 文本片语'}</span>
                            <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                          </div>
                          <button onClick={() => handleDeleteKbDoc(activeKb.id, doc.id)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'var(--danger-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}>删除</button>
                          
                          <div style={{ padding: '1rem', maxHeight: '180px', overflowY: 'auto' }}>
                            {doc.type === 'IMAGE' ? (
                              <img src={doc.url} alt="知识库图纸" style={{ maxWidth: '100%', borderRadius: '4px' }} />
                            ) : (
                              <p style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap', color: 'var(--text-main)', lineHeight: '1.6' }}>{doc.content}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card" style={{ margin: 0, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '500px' }}>
                  <div style={{ fontSize: '3rem', opacity: 0.5, marginBottom: '1rem' }}>👈</div>
                  <h3 style={{ margin: 0, color: 'var(--text-muted)' }}>请在左侧选择一个知识库</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>如果还没有，请先创建一个。</p>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
      
      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} />}
    </div>
  );
}
