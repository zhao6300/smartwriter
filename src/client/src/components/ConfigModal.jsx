import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function ConfigModal({ onClose }) {
  const [tab, setTab] = useState('model'); // 'model' | 'password'
  const [models, setModels] = useState([]);
  const [activeModelId, setActiveModelId] = useState('');
  const [loading, setLoading] = useState(true);

  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [systemRes, activeRes] = await Promise.all([
        axios.get('/config/system'),
        axios.get('/config/active')
      ]);
      setModels(systemRes.data);
      if (activeRes.data.active_model_id && systemRes.data.some(m => m.id === activeRes.data.active_model_id)) {
        setActiveModelId(activeRes.data.active_model_id);
      } else if (systemRes.data.length > 0) {
        setActiveModelId(systemRes.data[0].id);
      }
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if(!activeModelId) {
        alert("系统暂无可用的基础模型，请联系管理员上架！");
        return;
      }
      await axios.post('/config/active', { active_model_id: activeModelId });
      alert('算力节点绑定成功！');
      onClose();
    } catch (err) {
      alert('挂载失败: ' + err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('两次输入的新密码不一致！');
      return;
    }
    if (newPassword.length < 4) {
      alert('新密码至少需要 4 个字符！');
      return;
    }
    setPwdLoading(true);
    try {
      await axios.post('/auth/change-password', { oldPassword, newPassword });
      alert('✅ 密码修改成功！下次登录请使用新密码。');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err) {
      alert('密码修改失败：' + (err.response?.data?.error || err.message));
    } finally {
      setPwdLoading(false);
    }
  };

  const tabStyle = (t) => ({
    padding: '0.5rem 1.25rem',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
    background: tab === t ? 'var(--primary-color)' : 'transparent',
    color: tab === t ? 'white' : 'var(--text-muted)',
    transition: 'all 0.2s'
  });

  return (
    <div style={overlayStyle}>
      <div className="card" style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>⚙️ 个人设置</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--code-bg)', padding: '4px', borderRadius: '10px', marginBottom: '1.5rem' }}>
          <button style={tabStyle('model')} onClick={() => setTab('model')}>🎛️ 算力配置</button>
          <button style={tabStyle('password')} onClick={() => setTab('password')}>🔒 修改密码</button>
        </div>

        {tab === 'model' && (
          <>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 0 }}>
              当前由超级管理员统一提供算力基础池，您只需选用最匹配业务的驱动引擎。
            </p>
            {loading ? (
              <p style={{ padding: '2rem 0', textAlign: 'center' }}>探测核心资产中...</p>
            ) : (
              <form onSubmit={handleSave}>
                <div>
                  <label>选取正在激活的模型</label>
                  <select
                    value={activeModelId}
                    onChange={e => setActiveModelId(e.target.value)}
                    style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)', marginTop: '0.5rem' }}
                  >
                    {models.length === 0 && <option value="">无可用的公共资产，请联系超管</option>}
                    {models.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.model})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.8rem' }} disabled={models.length === 0}>绑定此算力源</button>
                  <button type="button" className="btn" onClick={onClose} style={{ flex: 1, background: 'var(--code-bg)', color: 'var(--text-main)', padding: '0.8rem' }}>取消</button>
                </div>
              </form>
            )}
          </>
        )}

        {tab === 'password' && (
          <form onSubmit={handleChangePassword}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: 0 }}>
              为保障账号安全，修改密码需要验证当前密码。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>当前密码</label>
                <input
                  type="password"
                  placeholder="请输入当前密码"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>新密码</label>
                <input
                  type="password"
                  placeholder="请输入新密码（至少 4 位）"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>确认新密码</label>
                <input
                  type="password"
                  placeholder="再次输入新密码"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.8rem' }} disabled={pwdLoading}>
                {pwdLoading ? '提交中...' : '🔒 确认修改密码'}
              </button>
              <button type="button" className="btn" onClick={onClose} style={{ flex: 1, background: 'var(--code-bg)', color: 'var(--text-main)', padding: '0.8rem' }}>取消</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)'
};

const modalStyle = {
  width: '100%',
  maxWidth: '480px',
  margin: '1rem'
};
