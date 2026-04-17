import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  
  const [models, setModels] = useState([]);
  const [newModel, setNewModel] = useState({ name: '', model: '', base_url: '', api_key: '' });

  useEffect(() => {
    if (!user || !user.is_admin) {
      navigate('/admin/login');
      return;
    }
    fetchStats();
    fetchModels();
  }, [user]);

  const fetchStats = async () => {
    try {
      const { data } = await axios.get('/admin/users/stats');
      setStats(data);
    } catch (e) {
      alert("提取用户数据失败");
    }
  };
  
  const fetchModels = async () => {
    try {
      const { data } = await axios.get('/admin/models');
      setModels(data);
    } catch (e) {
      alert("提取基础模型池资产失败");
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const handleAddModel = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/admin/models', newModel);
      setNewModel({ name: '', model: '', base_url: '', api_key: '' });
      fetchModels();
    } catch (e) {
      alert("添加资源库失败：" + (e.response?.data?.error || e.message));
    }
  };

  const handleDeleteModel = async (id) => {
    if(!window.confirm("这会导致正在绑定该模型的所有普通用户瘫痪，确定下架？")) return;
    try {
      await axios.delete(`/admin/models/${id}`);
      fetchModels();
    } catch (e) {
      alert("移除动作异常：" + e.message);
    }
  };

  if (!stats) return <div style={{ padding: '2rem', color: 'var(--text-main)', textAlign: 'center', marginTop: '20vh' }}>同步全局底层资产中...</div>;

  return (
    <div className="layout-wrapper">
      <nav className="navbar" style={{ background: 'var(--card-bg)' }}>
        <h2 style={{ color: 'var(--primary-color)', margin: 0, fontWeight: 700, letterSpacing: '1px' }}>🦅 管理员页面</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }} className="hide-on-mobile">特权节点：{user.username} [ROOT]</span>
          <button className="btn btn-primary" onClick={() => navigate('/')}>返回普通大厅</button>
          <button className="btn btn-danger" onClick={handleLogout}>切断隐身连接</button>
        </div>
      </nav>

      <div className="container" style={{ flex: 1, padding: '3rem 2rem', maxWidth: '1400px' }}>
        
        {/* TOP METRICS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
          <div className="card" style={{ borderLeft: '6px solid var(--primary-color)', padding: '1.5rem', margin: 0 }}>
             <h4 style={{ color: 'var(--text-muted)' }}>全系统注册用户总池</h4>
             <p style={{ fontSize: '3rem', fontWeight: 700, margin: '0.5rem 0' }}>{stats.systemTotalUsers}</p>
          </div>
          <div className="card" style={{ borderLeft: '6px solid #10b981', padding: '1.5rem', margin: 0 }}>
             <h4 style={{ color: 'var(--text-muted)' }}>全站流水/推文建档总频次</h4>
             <p style={{ fontSize: '3rem', fontWeight: 700, margin: '0.5rem 0', color: '#10b981' }}>{stats.systemTotalArticles}</p>
          </div>
        </div>

        {/* SYSTEM AI MODELS SECTION */}
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>🪐 系统算力源配发中心 (System LLM Models)</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>由于切断了个人用户自带密钥渠道，平台目前完全依赖下列模型资产。您输入的私钥信息极其敏感，对客户端隐藏！</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '3rem', alignItems: 'start' }}>
          
          <div className="card" style={{ margin: 0 }}>
            <h4 style={{ marginBottom: '1rem' }}>+ 上架新的算力节点</h4>
            <form onSubmit={handleAddModel} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem' }}>展示名称 (如: 官方 GPT-4o 或 阿里云特惠专线)</label>
                <input value={newModel.name} onChange={e=>setNewModel({...newModel, name: e.target.value})} required placeholder="提供给普通用户的肉眼选项" />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem' }}>Model 真实字符串定义 (如: gpt-4o, qwen-14b-chat)</label>
                <input value={newModel.model} onChange={e=>setNewModel({...newModel, model: e.target.value})} required placeholder="底层 API 握手时认准的型号名" />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem' }}>Base URL (网关代理集散地)</label>
                <input value={newModel.base_url} onChange={e=>setNewModel({...newModel, base_url: e.target.value})} required placeholder="https://api.openai.com/v1" />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem' }}>API Key (超管出资提供的顶层密钥)</label>
                <input type="password" value={newModel.api_key} onChange={e=>setNewModel({...newModel, api_key: e.target.value})} required placeholder="sk-..." />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', background: '#10b981' }}>灌输至模型池</button>
            </form>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto', margin: 0, height: '100%', border: '1px solid var(--border-color)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: 'var(--bg-color)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '1rem' }}>模型名称</th>
                  <th style={{ padding: '1rem' }}>底层标识号</th>
                  <th style={{ padding: '1rem' }}>归属网关</th>
                  <th style={{ padding: '1rem' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {models.length === 0 && <tr><td colSpan="4" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>平台内暂无模型供给，用户处于断电停摆状态！</td></tr>}
                {models.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{m.name}</td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--primary-color)' }}>{m.model}</td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{m.base_url}</td>
                    <td style={{ padding: '1rem' }}>
                      <button onClick={() => handleDeleteModel(m.id)} style={{ border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', cursor: 'pointer', padding: '0.25rem 0.6rem', borderRadius: '4px' }}>下架报废</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* USERS STATS SECTION */}
        <h3 style={{ marginBottom: '1.5rem' }}>各用户端操作画像与资产明细</h3>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-color)', borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '1.25rem 1.5rem' }}>账号标识 (ID)</th>
                <th style={{ padding: '1.25rem' }}>入驻时间</th>
                <th style={{ padding: '1.25rem' }}>特权级别</th>
                <th style={{ padding: '1.25rem' }}>建档立项总数</th>
                <th style={{ padding: '1.25rem' }}>✅ 已成功交付稿件</th>
                <th style={{ padding: '1.25rem' }}>📝 草稿/大纲阶段中</th>
              </tr>
            </thead>
            <tbody>
              {stats.usersStats.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s', ':hover': {background: 'rgba(0,0,0,0.02)'} }}>
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 600 }}>{u.username}</td>
                  <td style={{ padding: '1.25rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(u.created_at).toLocaleString()}</td>
                  <td style={{ padding: '1.25rem' }}>
                    {u.is_admin ? 
                      <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', padding: '0.35rem 0.75rem', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 600 }}>ROOT / 管理</span> 
                    : <span style={{ background: 'var(--bg-color)', padding: '0.35rem 0.75rem', borderRadius: '100px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>标准客户</span>}
                  </td>
                  <td style={{ padding: '1.25rem', fontWeight: 500 }}>{u.totalArticles} 项</td>
                  <td style={{ padding: '1.25rem', color: '#10b981', fontWeight: 700, fontSize: '1.1rem' }}>{u.completedArticles} 篇</td>
                  <td style={{ padding: '1.25rem', color: 'var(--text-muted)' }}>{u.drafts} 份</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
