import React, { useState, useEffect } from 'react';
import { useAuthStore, useThemeStore } from '../store';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ConfigModal from '../components/ConfigModal';

export default function Workspace() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const { id: projectId } = useParams();
  const [showConfig, setShowConfig] = useState(false);
  
  // Pipeline State
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [style, setStyle] = useState('');
  const [generateCount, setGenerateCount] = useState(1);
  
  const [outlines, setOutlines] = useState([]);
  const [articleId, setArticleId] = useState(null);
  const [projectLogs, setProjectLogs] = useState([]);
  
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  
  // Multiple final contents (one per generation)
  const [finalContents, setFinalContents] = useState([]); // [{id, name, content}]
  const [activeContentIdx, setActiveContentIdx] = useState(0);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [editingParagraph, setEditingParagraph] = useState(null); // {paraIdx, original, instruction, loading}

  // To remember which outline drove the generated copy
  const [chosenIdx, setChosenIdx] = useState(0);

  const [activePane, setActivePane] = useState('input');
  const [suggestingSection, setSuggestingSection] = useState(null);
  const [isGeneratingAllSections, setIsGeneratingAllSections] = useState(false);
  const [contentView, setContentView] = useState('rendered'); // 'rendered' | 'raw'
  
  const [typographyConfig, setTypographyConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('agentTypoConfig');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return { preset: 'typo-default', align: 'left', fontFamily: 'inherit', fontSize: '1rem' };
  });

  const updateTypoConfig = (key, val) => {
    setTypographyConfig(prev => {
      const next = { ...prev, [key]: val };
      localStorage.setItem('agentTypoConfig', JSON.stringify(next));
      return next;
    });
  };

  // Custom typography themes
  const [customThemes, setCustomThemes] = useState(() => {
    try {
      const saved = localStorage.getItem('agentCustomThemes');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [];
  });
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState(null);

  const defaultNewTheme = {
    name: '我的自定义主题',
    accentColor: '#6366f1',
    headingStyle: 'left-border', // left-border | center | center-lines | pill
    bodyColor: '#333333',
    bgColor: '#ffffff',
    blockquoteBg: '#f6f8fb',
    strongColor: '#6366f1',
    letterSpacing: '1px',
    lineHeight: '1.8',
  };

  const saveCustomTheme = (theme) => {
    const id = theme.id || ('custom-' + Date.now());
    const updated = customThemes.filter(t => t.id !== id);
    updated.push({ ...theme, id });
    setCustomThemes(updated);
    localStorage.setItem('agentCustomThemes', JSON.stringify(updated));
    updateTypoConfig('preset', id);
    setThemeEditorOpen(false);
    setEditingTheme(null);
  };

  const deleteCustomTheme = (id) => {
    const updated = customThemes.filter(t => t.id !== id);
    setCustomThemes(updated);
    localStorage.setItem('agentCustomThemes', JSON.stringify(updated));
    if (typographyConfig.preset === id) updateTypoConfig('preset', 'typo-default');
  };

  const getCustomThemeById = (id) => customThemes.find(t => t.id === id);
  const isCustomPreset = typographyConfig.preset.startsWith('custom-');
  
  // Templates state
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [viewingTemplate, setViewingTemplate] = useState(null); // for detail view
  const [editingTemplateOutline, setEditingTemplateOutline] = useState(null); // editable outline in template detail
  
  // Extract Template States
  const [isExtractingTemplate, setIsExtractingTemplate] = useState(false);
  const [extractUrl, setExtractUrl] = useState('');
  const [showExtractPane, setShowExtractPane] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState([]); // for bulk deletion
  
  // Tools states
  const [availableTools, setAvailableTools] = useState([]);
  const [selectedToolsForGen, setSelectedToolsForGen] = useState([]); // Array of tool names enabled 
  const [mcpForm, setMcpForm] = useState({ name: '', category: '内容库', config: '' });
  const [isAddingMcp, setIsAddingMcp] = useState(false);
  const [editingToolId, setEditingToolId] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    setArticleId(projectId);
    fetchProject();
  }, [projectId]);

  useEffect(() => {
    if (activePane === 'logs') {
      fetchProjectLogs();
    }
  }, [activePane]);

  if (!user) {
    setTimeout(() => navigate('/login'), 0);
    return null;
  }

  const fetchProject = async () => {
    try {
      const res = await axios.get(`/project/${projectId}`);
      const data = res.data;
      if (data.topic && data.topic !== '未命名创作') setTopic(data.topic);
      if (data.content) {
        try {
          const parsed = JSON.parse(data.content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFinalContents(parsed);
            setActiveContentIdx(0);
          }
        } catch {
          // Legacy single string — wrap it
          setFinalContents([{ id: 'legacy', name: '历史成品', content: data.content }]);
          setActiveContentIdx(0);
        }
      }
      
      if (data.outline) {
        try {
          const parsed = JSON.parse(data.outline);
          const outlineArray = parsed.outlines || parsed;
          if (Array.isArray(outlineArray) && outlineArray.length > 0) {
            setOutlines(outlineArray);
            if (data.status === 'COMPLETED') setActivePane('content-0');
            else setActivePane('outline-0');
          }
        } catch(e) { }
      }

      // Sync load personal templates
      const tempsRes = await axios.get('/template');
      setSavedTemplates(tempsRes.data);

      try {
        if (user?.id) {
          axios.get('/tools').then(res => {
            setAvailableTools(res.data);
            setSelectedToolsForGen(res.data.filter(t => t.is_active).map(t => t.name));
          }).catch(e => console.error("无法加载工具:", e));
        }
      } catch (e) {
        console.error("加载工具列表异常", e);
      }

    } catch(e) {
      console.error("加载资源异常", e);
    }
  };

  const fetchProjectLogs = async () => {
    try {
      const res = await axios.get(`/logs?projectId=${projectId}`);
      setProjectLogs(res.data);
    } catch(e) {
      console.error("加载项目日志失败:", e);
    }
  };

  const generateOutline = async () => {
    if (!topic) return alert("主题不能为空");
    setIsGeneratingOutline(true);
    try {
      const { data } = await axios.post('/workflow/outline', { 
        articleId: projectId, topic, audience, customStyle: style, selectedTools: selectedToolsForGen, generateCount,
        existingVariants: outlines.map(o => ({ variantName: o.variantName, core_idea: o.core_idea }))
      });
      const parsedOutlines = data.outline.outlines || data.outline;
      if (Array.isArray(parsedOutlines) && parsedOutlines.length > 0) {
        setOutlines(prev => [...prev, ...parsedOutlines]);
        setActivePane(`outline-${outlines.length}`);
      } else {
        alert("格式解析异常，请重试或检查生成的 JSON 结构");
      }
    } catch (err) {
      alert("生成大纲失败: " + (err.response?.data?.error || err.message));
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  // Add a brand-new AI variant without wiping others
  const addNewOutlineVariant = async () => {
    if (!topic) return alert("请先在第一步设定主题");
    setIsGeneratingOutline(true);
    try {
      const existing = Array.isArray(outlines) ? outlines : [];
      const existingVariantsPayload = existing.map(o => ({ variantName: o?.variantName || '未知', core_idea: o?.core_idea || '' }));

      const { data } = await axios.post('/workflow/outline', {
        articleId: projectId, topic, audience, customStyle: style,
        selectedTools: selectedToolsForGen,
        existingVariants: existingVariantsPayload,
        generateCount: 1
      });
      const parsed = data.outline?.outlines || data.outline;
      const parsedArr = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      
      if (parsedArr.length > 0) {
        const newVariant = parsedArr[0];
        const merged = [...existing, newVariant];
        setOutlines(merged);
        setActivePane(`outline-${merged.length - 1}`);
      } else {
        alert("新增视角解析失败，AI 未返回有效数据。");
      }
    } catch (err) {
      alert("新增大纲失败: " + (err.response?.data?.error || err.message));
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  // Delete the outline at a specific index
  const deleteOutlineVariant = (targetIdx) => {
    if (!window.confirm(`确定删除「${outlines[targetIdx]?.variantName || `版本 ${targetIdx + 1}`}」？`)) return;
    const updated = outlines.filter((_, i) => i !== targetIdx);
    setOutlines(updated);
    if (updated.length === 0) {
      setActivePane('input');
    } else {
      const newIdx = Math.min(targetIdx, updated.length - 1);
      setActivePane(`outline-${newIdx}`);
    }
  };

  // Regenerate a single outline variant in-place
  const regenerateOutlineVariant = async (targetIdx) => {
    if (!topic) return alert("主题不能为空");
    if (!window.confirm(`确定重新生成「${outlines[targetIdx]?.variantName || `版本 ${targetIdx + 1}`}」？这将覆盖当前内容。`)) return;
    setIsGeneratingOutline(true);
    try {
      // Pass all OTHER existing variants so the regenerated one differs from peers
      const otherVariants = outlines
        .filter((_, i) => i !== targetIdx)
        .map(o => ({ variantName: o.variantName, core_idea: o.core_idea }));
      const { data } = await axios.post('/workflow/outline', {
        articleId: projectId, topic, audience, customStyle: style,
        selectedTools: selectedToolsForGen,
        existingVariants: otherVariants,
        generateCount: 1
      });
      const parsed = data.outline.outlines || data.outline;
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Use the fresh AI-generated content AND its own name (content-aware)
        const freshVariant = parsed[0];
        const updated = [...outlines];
        updated[targetIdx] = freshVariant;
        setOutlines(updated);
        setActivePane(`outline-${targetIdx}`);
      }
    } catch (err) {
      alert("重新生成失败: " + (err.response?.data?.error || err.message));
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const loadTemplate = async (template) => {
    if(template.style) setStyle(template.style);
    try {
      const parsed = JSON.parse(template.framework);
      // Support both new (enriched) and legacy format
      const fw = parsed.original || parsed;
      const newFw = { ...fw, variantName: template.name + ' (复用模式)' };
      setOutlines([newFw]);
      setChosenIdx(0);
      setActivePane('outline-0');
    } catch(e) {
      alert("模板结构已损坏！");
    }
  };

  const saveCurrentAsTemplate = async () => {
    const fw = outlines[chosenIdx];
    if(!fw) return alert("没有检测到合规大纲。");
    const name = window.prompt("💡 请给这套写作套路起个名字（AI 会自动提炼抽象模式）：", fw.variantName || "套路模板");
    if(!name) return;
    try {
      await axios.post('/template', { name, style, framework: fw });
      alert("✅ 套路提炼成功！AI 已自动分析并归纳出抽象写作模式。");
      const tempsRes = await axios.get('/template');
      setSavedTemplates(tempsRes.data);
    } catch(e) {
      alert("存档失败：" + (e.response?.data?.error || e.message));
    }
  };

  const deleteTemplate = async (templateId) => {
    if (!window.confirm('确定删除这个套路模板？')) return;
    try {
      await axios.delete(`/template/${templateId}`);
      setSavedTemplates(prev => prev.filter(t => t.id !== templateId));
      if (viewingTemplate?.id === templateId) setViewingTemplate(null);
      setSelectedTemplates(prev => prev.filter(id => id !== templateId));
    } catch (e) {
      alert('删除失败');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTemplates.length === 0) return;
    if (!window.confirm(`确定要删除选中的 ${selectedTemplates.length} 个模板吗？此操作不可撤销。`)) return;
    try {
      await axios.post('/template/bulk-delete', { ids: selectedTemplates });
      setSavedTemplates(prev => prev.filter(t => !selectedTemplates.includes(t.id)));
      setSelectedTemplates([]);
    } catch(e) {
      alert("批量删除失败：" + (e.response?.data?.error || e.message));
    }
  };

  const handleExtractTemplate = async (mode, content) => {
    if (!content) return alert("内容不能为空！");
    setIsExtractingTemplate(true);
    try {
      const res = await axios.post('/template/extract', { sourceType: mode, content });
      alert("✅ 智能提取成功！");
      setSavedTemplates(prev => [res.data, ...prev]);
      setShowExtractPane(false);
      setExtractUrl('');
      setViewingTemplate(res.data);
    } catch(e) {
      alert("提炼失败：" + (e.response?.data?.error || e.message));
    } finally {
      setIsExtractingTemplate(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      handleExtractTemplate('text', evt.target.result);
      e.target.value = ''; // clear input
    };
    reader.readAsText(file);
  };

  const generateContent = async (selectedOutlineIndex) => {
    const outlineToUse = outlines[selectedOutlineIndex];
    if (!outlineToUse || !articleId) return;
    
    setChosenIdx(selectedOutlineIndex);
    // create a new slot for this generation
    const newIdx = finalContents.length;
    const outlineName = outlineToUse.variantName || `大纲 ${selectedOutlineIndex + 1}`;
    const newEntry = { id: Date.now().toString(), name: outlineName, content: '' };
    setFinalContents(prev => [...prev, newEntry]);
    setActiveContentIdx(newIdx);
    setActivePane(`content-${newIdx}`);
    setIsGeneratingContent(true);
    
    let accumulated = '';
    try {
      const res = await fetch('/api/workflow/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`
        },
        body: JSON.stringify({ articleId, final_outline: outlineToUse, contentName: outlineName, customStyle: style, selectedTools: selectedToolsForGen })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (dataStr.trim() === '{}') continue;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  accumulated += parsed.text;
                  setFinalContents(prev => {
                    const updated = [...prev];
                    updated[newIdx] = { ...updated[newIdx], content: accumulated };
                    return updated;
                  });
                }
              } catch (e) {}
            } else if (line.startsWith('event: end')) {
              done = true;
            }
          }
        }
      }
    } catch (err) {
      alert("流式生成发生错误: " + err.message);
    } finally {
      setIsGeneratingContent(false);
    }
  };

  // AI revise a paragraph in the current final content
  const handleReviseParagraph = async (paraIdx, paragraphs) => {
    if (!editingParagraph?.instruction?.trim()) return alert("请输入修改要求");
    const currentContent = finalContents[activeContentIdx]?.content || '';
    setEditingParagraph(prev => ({ ...prev, loading: true }));
    try {
      const res = await axios.post('/workflow/revise-paragraph', {
        paragraphContent: paragraphs[paraIdx],
        instruction: editingParagraph.instruction,
        fullContext: currentContent
      });
      const revised = res.data.revised;
      if (revised) {
        const newParagraphs = [...paragraphs];
        newParagraphs[paraIdx] = revised;
        const newContent = newParagraphs.join('\n\n');
        setFinalContents(prev => {
          const updated = [...prev];
          updated[activeContentIdx] = { ...updated[activeContentIdx], content: newContent };
          return updated;
        });
        setEditingParagraph(null);
      }
    } catch (err) {
      alert("修改失败: " + (err.response?.data?.error || err.message));
    } finally {
      setEditingParagraph(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  // Delete a single content variant and persist to DB
  const deleteContentVariant = async (targetIdx) => {
    const entry = finalContents[targetIdx];
    if (!window.confirm(`确定删除成品「${entry?.name || `成品 ${targetIdx + 1}`}」？此操作不可撤销。`)) return;
    const updated = finalContents.filter((_, i) => i !== targetIdx);
    setFinalContents(updated);
    // Navigate to a valid pane
    if (updated.length === 0) {
      setActivePane('input');
    } else {
      const newIdx = Math.min(targetIdx, updated.length - 1);
      setActiveContentIdx(newIdx);
      setActivePane(`content-${newIdx}`);
    }
    // Persist deletion to DB
    try {
      await axios.put(`/project/${projectId}/contents`, { contents: updated });
    } catch (e) {
      console.error('持久化删除失败', e);
    }
  };

  const renderActivePane = () => {
    if (activePane === 'templates') {
      return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0, overflowY: 'auto' }}>
          <h3 style={{ marginBottom: '1rem' }}>📚 套路模板库</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>每个模板都由 AI 自动提炼抽象写作模式，可应用到任何新主题上。</span>
            {!viewingTemplate && !showExtractPane && (
              <button 
                onClick={() => setShowExtractPane(true)} 
                className="btn btn-primary" 
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '100px' }}
              >
                🆕 智能提取新套路
              </button>
            )}
          </p>

          {showExtractPane ? (
            <div style={{ background: 'var(--code-bg)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1rem', border: '1px solid var(--primary-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>🤖 从文章/链接智能提取</h4>
                <button onClick={() => setShowExtractPane(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕ 取消</button>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>提供一篇爆款文章或者一段优质文案，AI会通读全文，逆向提炼并生成配套的框架结构模板。</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    placeholder="输入文章网址链接 (例如: https://xxx)" 
                    value={extractUrl}
                    onChange={e => setExtractUrl(e.target.value)}
                    style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-main)', outline: 'none' }}
                  />
                  <button 
                    disabled={isExtractingTemplate || !extractUrl}
                    onClick={() => handleExtractTemplate('url', extractUrl)}
                    className="btn btn-primary"
                    style={{ padding: '0 1.5rem' }}
                  >
                    {isExtractingTemplate ? '解析中...' : '提取链接'}
                  </button>
                </div>
                
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>—— 或者 ——</div>
                
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <label className="btn" style={{ cursor: isExtractingTemplate ? 'not-allowed' : 'pointer', background: 'var(--card-bg)', border: '1px dashed var(--primary-color)', color: 'var(--primary-color)', padding: '0.8rem 2rem', borderRadius: '8px', opacity: isExtractingTemplate ? 0.6 : 1 }}>
                    {isExtractingTemplate ? '解析中...' : '📄 上传纯文本/Markdown文档 (txt, md)'}
                    <input 
                      type="file" 
                      accept=".txt,.md" 
                      style={{ display: 'none' }} 
                      onChange={handleFileUpload} 
                      disabled={isExtractingTemplate}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : savedTemplates.length === 0 && !viewingTemplate ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📦</div>
              <p>还没有保存任何套路。</p>
              <p style={{ fontSize: '0.85rem' }}>在「最后成品」页面点击「💾 存储套路」即可保存。</p>
            </div>
          ) : viewingTemplate ? (() => {
            let fw;
            try { fw = JSON.parse(viewingTemplate.framework); } catch { fw = {}; }
            const abs = fw.abstract || {};
            const orig = fw.original || fw;

            // Use local editing state — initialize once when template changes
            if (!editingTemplateOutline || editingTemplateOutline._templateId !== viewingTemplate.id) {
              const initOutline = {
                _templateId: viewingTemplate.id,
                variantName: orig.variantName || viewingTemplate.name,
                core_idea: orig.core_idea || orig.style || '',
                logic_organization: orig.logic_organization || orig.background || '',
                sections: Array.isArray(orig.sections) ? orig.sections.map(s => ({ ...s })) : []
              };
              // We can't call setState during render, so use a ref-like trick
              setTimeout(() => setEditingTemplateOutline(initOutline), 0);
              // Return loading state for first render
              return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>加载模板内容...</div>;
            }

            const eto = editingTemplateOutline;
            const updateEto = (field, value) => setEditingTemplateOutline(prev => ({ ...prev, [field]: value }));
            const updateEtoSection = (sIdx, field, value) => {
              const newSections = [...eto.sections];
              newSections[sIdx] = { ...newSections[sIdx], [field]: value };
              updateEto('sections', newSections);
            };
            const addEtoSection = () => updateEto('sections', [...eto.sections, { title: '新段落', desc: '描述内容' }]);
            const removeEtoSection = (sIdx) => updateEto('sections', eto.sections.filter((_, i) => i !== sIdx));

            const handleApplyTemplate = () => {
              const outlineToApply = {
                variantName: eto.variantName + ' (复用模式)',
                core_idea: eto.core_idea,
                logic_organization: eto.logic_organization,
                sections: eto.sections
              };
              if (style === '' && viewingTemplate.style) setStyle(viewingTemplate.style);
              setOutlines([outlineToApply]);
              setChosenIdx(0);
              setActivePane('outline-0');
              setViewingTemplate(null);
              setEditingTemplateOutline(null);
            };

            const handleUpdateTemplate = async () => {
              try {
                const frameworkToSave = {
                  core_idea: eto.core_idea,
                  logic_organization: eto.logic_organization,
                  sections: eto.sections
                };
                const res = await axios.put(`/template/${viewingTemplate.id}`, {
                  name: eto.variantName, // saving the edited name
                  framework: frameworkToSave
                });
                alert('💾 修改已成功保存至模板库！');
                setSavedTemplates(prev => prev.map(t => t.id === viewingTemplate.id ? res.data : t));
                setViewingTemplate(res.data);
              } catch(e) {
                alert('修改保存失败：' + (e.response?.data?.error || e.message));
              }
            };

            return (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <button onClick={() => { setViewingTemplate(null); setEditingTemplateOutline(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem', padding: 0 }}>← 返回列表</button>
                
                {/* AI Abstract Summary */}
                <div style={{ background: 'var(--code-bg)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
                  <input
                    value={eto.variantName}
                    onChange={e => updateEto('variantName', e.target.value)}
                    style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--primary-color)', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--primary-color)', width: '100%', outline: 'none', padding: '0.2rem 0' }}
                    placeholder="请输入套路名称..."
                  />
                  {abs.writing_strategy && <p style={{ fontSize: '0.85rem', margin: '0.6rem 0 0.4rem', lineHeight: 1.6, color: 'var(--text-muted)' }}>🎯 {abs.writing_strategy}</p>}
                  {abs.emotional_arc && <p style={{ fontSize: '0.85rem', margin: '0.4rem 0', lineHeight: 1.6, color: 'var(--text-muted)' }}>🌊 {abs.emotional_arc}</p>}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {(abs.key_techniques || []).map((t, i) => <span key={i} style={{ padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.7rem', color: 'var(--primary-color)' }}>{t}</span>)}
                  </div>
                </div>

                {/* Editable Outline Content */}
                <h4 style={{ marginBottom: '0.75rem' }}>✏️ 大纲内容（可修改后应用 或 保存）</h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'var(--code-bg)', padding: '0.75rem 1rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>🎭 核心思想</label>
                    <input
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '0.9rem', padding: '0.4rem 0', color: 'var(--text-main)', outline: 'none', borderBottom: '1px solid var(--border-color)' }}
                      value={eto.core_idea}
                      onChange={e => updateEto('core_idea', e.target.value)}
                    />
                  </div>
                  <div style={{ background: 'var(--code-bg)', padding: '0.75rem 1rem', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>🏔️ 逻辑组织</label>
                    <textarea
                      style={{ width: '100%', border: 'none', background: 'transparent', resize: 'vertical', minHeight: '50px', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-main)', outline: 'none' }}
                      value={eto.logic_organization}
                      onChange={e => updateEto('logic_organization', e.target.value)}
                    />
                  </div>
                </div>

                <h4 style={{ marginBottom: '0.75rem' }}>🧱 段落结构</h4>
                {eto.sections.map((sec, sIdx) => (
                  <div key={sIdx} style={{ background: 'var(--code-bg)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '0.5rem', borderLeft: '3px solid var(--primary-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                      <span style={{ background: 'var(--primary-color)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>{sIdx + 1}</span>
                      <input
                        value={sec.title}
                        onChange={e => updateEtoSection(sIdx, 'title', e.target.value)}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)', outline: 'none' }}
                      />
                      <button onClick={() => removeEtoSection(sIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--danger-color)', padding: '0.1rem 0.3rem' }}>✕</button>
                    </div>
                    <textarea
                      value={sec.desc}
                      onChange={e => updateEtoSection(sIdx, 'desc', e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', resize: 'vertical', minHeight: '36px', fontFamily: 'inherit', fontSize: '0.8rem', lineHeight: '1.5', color: 'var(--text-muted)', outline: 'none' }}
                    />
                  </div>
                ))}
                <button onClick={addEtoSection} style={{ width: '100%', padding: '0.5rem', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>+ 添加段落</button>

                <div style={{ display: 'flex', gap: '0.75rem', position: 'sticky', bottom: 0, background: 'var(--card-bg)', padding: '0.75rem 0', borderTop: '1px solid var(--border-color)' }}>
                  <button className="btn" style={{ flex: 1, padding: '0.8rem', background: '#10b981', color: 'white', border: 'none' }} onClick={handleUpdateTemplate}>💾 保存修改</button>
                  <button className="btn btn-primary" style={{ flex: 1, padding: '0.8rem' }} onClick={handleApplyTemplate}>⚡ 应用到项目</button>
                </div>
              </div>
            );
          })() : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              
              {savedTemplates.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', background: 'var(--bg-color)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                    <input 
                      type="checkbox" 
                      style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--primary-color)' }}
                      checked={selectedTemplates.length === savedTemplates.length && savedTemplates.length > 0}
                      onChange={e => {
                        if (e.target.checked) setSelectedTemplates(savedTemplates.map(t => t.id));
                        else setSelectedTemplates([]);
                      }}
                    />
                    全选 ({selectedTemplates.length}/{savedTemplates.length})
                  </label>
                  {selectedTemplates.length > 0 && (
                    <button 
                      onClick={handleBulkDelete}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', border: 'none', padding: '0.3rem 0.8rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      🗑️ 删除选中的 {selectedTemplates.length} 个
                    </button>
                  )}
                </div>
              )}

              {savedTemplates.map(t => {
                let abs = {};
                try { const p = JSON.parse(t.framework); abs = p.abstract || {}; } catch {}
                const isChecked = selectedTemplates.includes(t.id);
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: isChecked ? 'var(--card-bg)' : 'var(--code-bg)', borderRadius: '10px', padding: '1rem 1.25rem', border: isChecked ? '1px solid var(--primary-color)' : '1px solid var(--border-color)', transition: 'all 0.2s', boxShadow: isChecked ? '0 0 0 1px var(--primary-color)' : 'none' }}>
                    <input 
                      type="checkbox" 
                      style={{ cursor: 'pointer', width: '18px', height: '18px', accentColor: 'var(--primary-color)', flexShrink: 0 }}
                      checked={isChecked}
                      onChange={e => {
                        if (e.target.checked) setSelectedTemplates(prev => [...prev, t.id]);
                        else setSelectedTemplates(prev => prev.filter(id => id !== t.id));
                      }}
                    />
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewingTemplate(t)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>⚡ {t.name}</h4>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                      </div>
                      {abs.writing_strategy && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{abs.writing_strategy}</p>}
                      {abs.emotional_arc && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--primary-color)' }}>🌊 {abs.emotional_arc}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (activePane === 'input') {
      return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0, overflowY: 'auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📝</span>
            <h3 style={{ margin: 0 }}>核心构思 (Idea Definition)</h3>
          </div>
          
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.6', fontSize: '0.9rem' }}>
            在此确立您的文章主脉络。下达指令后，大模型将自动为你发散思维，
            构建出<strong style={{color: 'var(--primary-color)'}}>逻辑缜密的骨干大纲</strong>。
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            <div style={{ background: 'var(--code-bg)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--primary-color)' }}>
               <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  🎯 核心主题 (必填)
               </label>
               <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>用具体的句子描述您想要创作的内容核心焦点，要求越具体越好。</span>
               <input 
                 placeholder="例如：大模型技术是如何颠覆现代前端开发工作流的，带来了哪些具体改变？" 
                 value={topic} 
                 onChange={e => setTopic(e.target.value)} 
                 style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.3)', background: 'var(--card-bg)', color: 'var(--text-main)', outline: 'none' }}
               />
            </div>
            
            <div style={{ background: 'var(--code-bg)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', borderLeft: '4px solid #10b981' }}>
               <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  👥 目标受众 (可选)
               </label>
               <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>明确读者群体，大模型将自动调整整篇文章的对话深度与专业名词门槛。</span>
               <input 
                 placeholder="例如：拥有1-3年经验的初中级前端开发者，非全栈" 
                 value={audience} 
                 onChange={e => setAudience(e.target.value)} 
                 style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid transparent', background: 'var(--card-bg)', color: 'var(--text-main)', outline: 'none', transition: '0.2s', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }}
                 onFocus={e => e.target.style.border = '1px solid #10b981'}
                 onBlur={e => e.target.style.border = '1px solid transparent'}
               />
            </div>

            <div style={{ background: 'var(--code-bg)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', borderLeft: '4px solid #f59e0b', display: 'flex', flexDirection: 'column' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                 <div>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                      🎭 风格约束与排版要求 (可选)
                   </label>
                   <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                     如果你通过左侧【模板与套路中心】调用了文风模板，此框将被智能提取的指令级分析充满，可手动微调。
                   </span>
                 </div>
               </div>
               <textarea 
                 placeholder="例如：语言要幽默风趣带点自黑，多讲干货，尽量不要用生僻的学术词汇，每段不超过三句话..." 
                 value={style} 
                 onChange={e => setStyle(e.target.value)} 
                 style={{ width: '100%', resize: 'vertical', minHeight: '100px', fontFamily: 'inherit', fontSize: '0.85rem', padding: '0.75rem', borderRadius: '6px', border: '1px solid transparent', outline: 'none', background: 'var(--card-bg)', color: 'var(--text-main)', lineHeight: '1.6', boxSizing: 'border-box', transition: '0.2s', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)' }} 
                 onFocus={e => e.target.style.border = '1px solid #f59e0b'}
                 onBlur={e => e.target.style.border = '1px solid transparent'}
               />
            </div>
          </div>
          
          <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
            
            {availableTools.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                   <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>🧰 外挂推演增强工具 (Agent Tools)</span>
                   <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>勾选工具协助查阅最新资料发散灵感</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                  {availableTools.filter(t => t.is_active).map(tool => {
                    const isSelected = selectedToolsForGen.includes(tool.name);
                    return (
                      <div 
                        key={tool.id} 
                        onClick={() => {
                          if (isSelected) setSelectedToolsForGen(p => p.filter(n => n !== tool.name));
                          else setSelectedToolsForGen(p => [...p, tool.name]);
                        }}
                        style={{ 
                          display: 'flex', 
                          flexDirection: 'column',
                          gap: '0.35rem', 
                          padding: '0.85rem', 
                          borderRadius: '8px', 
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--code-bg)',
                          border: isSelected ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--border-color)',
                          boxShadow: isSelected ? '0 4px 12px rgba(99,102,241,0.1)' : 'none',
                          transition: 'all 0.2s ease',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {tool.name === 'web_search' ? '🌐 全网实时检索' : `🔌 ${tool.name}`}
                          </span>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: isSelected ? '4px solid var(--primary-color)' : '1px solid var(--border-color)', transition: '0.2s', flexShrink: 0 }} />
                        </div>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{tool.category || 'MCP 外部节点'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: 'var(--code-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>💡 预生成大纲方案数</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>让模型同时推演多个不同视角的骨架供挑选</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                 <input type="range" min="1" max="5" value={generateCount} onChange={e => setGenerateCount(Number(e.target.value))} style={{ width: '100px', accentColor: 'var(--primary-color)' }} />
                 <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary-color)', minWidth: '20px', textAlign: 'center' }}>{generateCount}</span>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} onClick={generateOutline} disabled={isGeneratingOutline}>
              {isGeneratingOutline ? '正在脑暴并多发分路推演大纲...' : '生成智能多角大纲 ✨'}
            </button>
          </div>
        </div>
      );
    }

    if (activePane.startsWith('outline-')) {
      const idx = parseInt(activePane.split('-')[1], 10);
      const currentOutline = outlines[idx] || {};

      const updateGlobalField = (field, value) => {
        const newOutlines = [...outlines];
        newOutlines[idx] = { ...currentOutline, [field]: value };
        setOutlines(newOutlines);
      };

      const updateSection = (sIdx, field, value) => {
        const newSections = [...(currentOutline.sections || [])];
        newSections[sIdx] = { ...newSections[sIdx], [field]: value };
        updateGlobalField('sections', newSections);
      };

      const addSection = () => {
        const newSections = [...(currentOutline.sections || []), { title: '新增段落小标题', desc: '在这里输入你想表达的内容' }];
        updateGlobalField('sections', newSections);
      };
      
      const removeSection = (sIdx) => {
        if(!window.confirm("确定删除这个段落结构？")) return;
        const newSections = [...(currentOutline.sections || [])];
        newSections.splice(sIdx, 1);
        updateGlobalField('sections', newSections);
      };

      const handleSuggestSection = async (sIdx, sec) => {
        setSuggestingSection(sIdx);
        try {
          const res = await axios.post('/workflow/suggest-section', {
            topic,
            core_idea: currentOutline.core_idea || '',
            logic_organization: currentOutline.logic_organization || '',
            title: sec.title
          });
          const suggestion = res.data.suggestion;
          if (suggestion) {
            updateSection(sIdx, 'desc', suggestion);
          }
        } catch (err) {
          alert("请求推演失败: " + (err.response?.data?.error || err.message));
        } finally {
          setSuggestingSection(null);
        }
      };

      const handleGenerateAllSections = async () => {
        if (!window.confirm("这将请求 AI 重新生成整组段落大纲，将覆盖现有内容，确定继续？")) return;
        setIsGeneratingAllSections(true);
        try {
          const res = await axios.post('/workflow/suggest-section', {
            topic,
            core_idea: currentOutline.core_idea || '',
            logic_organization: currentOutline.logic_organization || '',
            title: '__ALL__',
            generateAll: true
          });
          if (res.data.sections && Array.isArray(res.data.sections)) {
            updateGlobalField('sections', res.data.sections);
          } else {
            alert("返回格式异常，请重试");
          }
        } catch (err) {
          alert("批量推演失败: " + (err.response?.data?.error || err.message));
        } finally {
          setIsGeneratingAllSections(false);
        }
      };

      return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0 }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <span>文章大纲</span>
            <input 
              value={currentOutline.variantName || `大纲版本 ${idx + 1}`} 
              onChange={(e) => updateGlobalField('variantName', e.target.value)}
              style={{ fontSize: '0.9rem', color: 'white', backgroundColor: 'var(--primary-color)', padding: '0.4rem 1.5rem', borderRadius: '100px', border: 'none', fontWeight: 600, width: '220px', textAlign: 'center', cursor: 'text' }} 
              title="点击重命名此大纲变体名称"
            />
          </h3>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              <div style={{ background: 'var(--code-bg)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>🎭 核心思想与痛点主旨 (Core Idea)</label>
                <input 
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '0.95rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(0,0,0,0.1)', color: 'var(--text-main)', outline: 'none' }}
                  value={currentOutline.core_idea || currentOutline.style || ''} 
                  onChange={(e) => updateGlobalField('core_idea', e.target.value)}
                />
              </div>

              <div style={{ background: 'var(--code-bg)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>🏔️ 逻辑组织与起承转合 (Logic Organization)</label>
                <textarea 
                  style={{ width: '100%', border: 'none', background: 'transparent', resize: 'vertical', minHeight: '60px', 
                           fontFamily: 'inherit', fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-main)', outline: 'none' }}
                  value={currentOutline.logic_organization || currentOutline.background || ''} 
                  onChange={(e) => updateGlobalField('logic_organization', e.target.value)}
                />
              </div>
            </div>

            <div>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-main)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🧱 文章分段区块阵列 (Sections)
              </h4>
              
              {(Array.isArray(currentOutline.sections) ? currentOutline.sections : []).length === 0 && (
                 <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>暂无段落，请点击下方按钮新建</div>
              )}

              {(Array.isArray(currentOutline.sections) ? currentOutline.sections : []).map((s, i) => (
                <div key={i} style={{ 
                  background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', 
                  padding: '1.5rem 2rem', marginBottom: '1.5rem', position: 'relative', 
                  boxShadow: '0 8px 30px rgba(0,0,0,0.04)', transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                  borderTop: '4px solid var(--primary-color)', zIndex: 5
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.04)'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)', background: 'var(--card-bg)', border: '1px solid var(--primary-color)', padding: '0.2rem 0.8rem', borderRadius: '100px' }}>
                      段落 {i + 1}
                    </span>
                    <button onClick={() => removeSection(i)} className="btn" style={{ border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '0.85rem', padding: '0.3rem 0.8rem' }}>
                      🗑️ 摧毁此段
                    </button>
                  </div>
                  
                  <input 
                    placeholder="请输入段落小标题"
                    value={s.title || ''} 
                    onChange={e => updateSection(i, 'title', e.target.value)} 
                    style={{ fontSize: '1.25rem', fontWeight: 700, border: 'none', borderBottom: '2px solid transparent', padding: '0.5rem 0', width: '100%', marginBottom: '1rem', background: 'transparent', color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.2s' }}
                    onFocus={e => e.target.style.borderBottom = '2px dashed var(--primary-color)'}
                    onBlur={e => e.target.style.borderBottom = '2px solid transparent'}
                  />
                  <textarea 
                    placeholder="请详述该段落起承转合的核心逻辑与具体要讲解的内容..."
                    value={s.desc || ''} 
                    onChange={e => updateSection(i, 'desc', e.target.value)} 
                    style={{ width: '100%', minHeight: '90px', border: 'none', background: 'var(--code-bg)', borderRadius: '8px', padding: '1rem', resize: 'vertical', fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: '1.7', outline: 'none', marginBottom: '1rem', border: '1px solid var(--border-color)' }}
                  />
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px dashed var(--border-color)', paddingTop: '0.75rem' }}>
                    <button 
                       onClick={() => handleSuggestSection(i, s)}
                       disabled={suggestingSection === i}
                       style={{ background: 'var(--card-bg)', border: '1px solid #3b82f6', color: '#3b82f6', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: suggestingSection === i ? 0.6 : 1 }}
                    >
                      {suggestingSection === i ? '⏳ 引擎疯狂推演中...' : '🤖 AI 智能推演本段落策略'}
                    </button>
                  </div>
                </div>
              ))}
              
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button 
                  onClick={addSection} 
                  style={{ flex: 1, padding: '0.875rem', background: 'var(--card-bg)', color: 'var(--primary-color)', border: '2px dashed var(--primary-color)', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', fontSize: '0.9rem' }}
                >
                  ➕ 手动新建一个段落
                </button>
                <button 
                  onClick={handleGenerateAllSections}
                  disabled={isGeneratingAllSections}
                  style={{ flex: 1, padding: '0.875rem', background: isGeneratingAllSections ? 'var(--card-bg)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: isGeneratingAllSections ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: '12px', cursor: isGeneratingAllSections ? 'not-allowed' : 'pointer', fontWeight: 600, transition: 'all 0.2s', fontSize: '0.9rem' }}
                >
                  {isGeneratingAllSections ? '✨ AI 正在规划整体大纲...' : '🤖 一键让 AI 生成全部段落'}
                </button>
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            {availableTools.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', display: 'block', marginBottom: '0.75rem' }}>🧰 结合外挂工具生成终稿：</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                  {availableTools.filter(t => t.is_active).map(tool => {
                    const isSelected = selectedToolsForGen.includes(tool.name);
                    return (
                      <div 
                        key={tool.id} 
                        onClick={() => {
                          if (isSelected) setSelectedToolsForGen(p => p.filter(n => n !== tool.name));
                          else setSelectedToolsForGen(p => [...p, tool.name]);
                        }}
                        style={{ 
                          display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.85rem', borderRadius: '8px', cursor: 'pointer',
                          background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--code-bg)',
                          border: isSelected ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--border-color)',
                          boxShadow: isSelected ? '0 4px 12px rgba(99,102,241,0.1)' : 'none', transition: 'all 0.2s ease', position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {tool.name === 'web_search' ? '🌐 开启最终资料检搜' : `🔌 ${tool.name}`}
                          </span>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: isSelected ? '4px solid var(--primary-color)' : '1px solid var(--border-color)', transition: '0.2s', flexShrink: 0 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} onClick={() => generateContent(idx)} disabled={isGeneratingContent}>
               ⚡ 确认以上完美骨架映射并流转生成极品终稿 🚀
            </button>
          </div>
        </div>
      );
    }

    if (activePane.startsWith('content-')) {
      const cIdx = parseInt(activePane.split('-')[1], 10);
      const currentEntry = finalContents[cIdx] || { content: '', name: '成品' };
      const currentContent = currentEntry.content;
      const isStreaming = isGeneratingContent && cIdx === finalContents.length - 1;

      const renderMarkdown = (text) => {
        return text
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.08);padding:0.1em 0.4em;border-radius:4px;font-family:monospace">$1</code>')
          .replace(/^> (.+)$/gm, '<blockquote style="border-left:4px solid var(--primary-color);padding-left:1rem;margin:0.5rem 0;color:var(--text-muted)">$1</blockquote>')
          .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border-color);margin:1.5rem 0">')
          .replace(/\n/g, '<br/>');
      };

      // Split content into paragraphs for per-para editing
      const paragraphs = currentContent.split(/\n\n+/);

      // --- Export functions ---
      const getExportHtml = () => {
        const rendered = paragraphs.map(p => renderMarkdown(p)).join('');
        const fontFamily = typographyConfig.fontFamily === 'inherit' ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' : typographyConfig.fontFamily;
        const preset = typographyConfig.preset;
        
        // Theme-aware accent colors
        const themeMap = {
          'typo-wechat-elegant':  { accent: '#10b981', bqBg: '#f0fdf4', h2Style: 'color:#10b981;text-align:center;border:none;', strongColor: '#10b981' },
          'typo-wechat-vibrant':  { accent: '#f97316', bqBg: '#fff7ed', h2Style: 'color:#fff;background:linear-gradient(135deg,#f97316,#fb923c);padding:0.5em 1em;border-radius:100px;display:inline-block;', strongColor: '#ea580c' },
          'typo-wechat-tech':     { accent: '#2563eb', bqBg: '#f0f9ff', h2Style: 'color:#2563eb;border-left:4px solid #2563eb;padding-left:12px;background:#eff6ff;border-radius:0 6px 6px 0;padding:0.5em 1em 0.5em 12px;', strongColor: '#1d4ed8' },
          'typo-wechat-literary': { accent: '#ec4899', bqBg: '#fdf2f8', h2Style: 'color:#be185d;text-align:center;font-style:italic;font-weight:400;letter-spacing:3px;', strongColor: '#be185d' },
          'typo-wechat-dark':     { accent: '#22d3ee', bqBg: '#1e293b', h2Style: 'color:#22d3ee;border-bottom:2px solid #22d3ee;padding-bottom:0.4em;', strongColor: '#34d399', bodyBg: '#0f172a', bodyColor: '#e2e8f0' },
          'typo-zhihu':           { accent: '#056de8', bqBg: '#f6f6f6', h2Style: 'font-weight:600;border-bottom:1px solid #ebebeb;padding-bottom:0.3em;', strongColor: '#121212' },
        };
        const t = themeMap[preset] || (() => {
          // Check custom themes
          const ct = getCustomThemeById(preset);
          if (ct) {
            const h2Map = {
              'left-border': `color:${ct.accentColor};border-left:4px solid ${ct.accentColor};padding-left:10px;`,
              'center': `color:${ct.accentColor};text-align:center;border:none;`,
              'center-lines': `color:${ct.accentColor};text-align:center;border:none;`,
              'pill': `color:#fff;background:${ct.accentColor};padding:0.5em 1em;border-radius:100px;display:inline-block;`,
            };
            return { accent: ct.accentColor, bqBg: ct.blockquoteBg, h2Style: h2Map[ct.headingStyle] || '', strongColor: ct.strongColor, bodyBg: ct.bgColor, bodyColor: ct.bodyColor };
          }
          return { accent: '#6366f1', bqBg: '#f6f8fb', h2Style: '', strongColor: '#333' };
        })();
        const isDark = (preset === 'typo-wechat-dark') || (t.bodyBg && parseInt((t.bodyBg || '#fff').replace('#',''), 16) < 0x666666);
        
        return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${currentEntry.name || '成品文章'}</title>
<style>
  body { font-family: ${preset === 'typo-wechat-literary' ? 'Georgia,"Songti SC","SimSun",serif' : fontFamily}; font-size: ${typographyConfig.fontSize}; line-height: 1.8; text-align: ${typographyConfig.align}; color: ${isDark ? '#e2e8f0' : '#333'}; background: ${isDark ? '#0f172a' : '#fff'}; max-width: 720px; margin: 2rem auto; padding: 0 1.5rem; }
  h1 { font-size: 1.6em; margin: 1.5em 0 0.6em; }
  h2 { font-size: 1.3em; margin: 1.4em 0 0.5em; ${t.h2Style} }
  h3 { font-size: 1.1em; margin: 1.2em 0 0.4em; }
  p { margin-bottom: 1.2em; }
  strong { font-weight: 700; color: ${t.strongColor}; }
  em { font-style: italic; }
  blockquote { border-left: 4px solid ${t.accent}; padding: 0.8em 1em; margin: 1em 0; background: ${t.bqBg}; color: ${isDark ? '#94a3b8' : '#666'}; border-radius: 4px; }
  hr { border: none; border-top: 1px solid ${isDark ? '#334155' : '#ddd'}; margin: 1.5rem 0; }
  code { background: ${isDark ? '#1e293b' : 'rgba(0,0,0,0.06)'}; padding: 0.1em 0.4em; border-radius: 3px; font-family: monospace; ${isDark ? 'color:#22d3ee;' : ''} }
  @media print { body { max-width: 100%; margin: 0; background: #fff; color: #333; } }
</style>
</head><body>${rendered}</body></html>`;
      };

      const exportToWord = () => {
        const html = getExportHtml();
        const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (currentEntry.name || '成品文章') + '.doc';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      const exportToPDF = () => {
        const html = getExportHtml();
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 400);
      };

      return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0 }}>
          
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>✨</span> 最后成品
              {isStreaming && <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 400, animation: 'pulse 1.5s ease-in-out infinite' }}>● 生成中...</span>}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {currentContent && (
                <div style={{ display: 'flex', background: 'var(--code-bg)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-color)' }}>
                  <button onClick={() => setContentView('rendered')} style={{ padding: '0.3rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, background: contentView === 'rendered' ? 'var(--primary-color)' : 'transparent', color: contentView === 'rendered' ? 'white' : 'var(--text-muted)', transition: 'all 0.2s' }}>📄 渲染</button>
                  <button onClick={() => setContentView('raw')} style={{ padding: '0.3rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, background: contentView === 'raw' ? 'var(--primary-color)' : 'transparent', color: contentView === 'raw' ? 'white' : 'var(--text-muted)', transition: 'all 0.2s' }}>📝 源码</button>
                </div>
              )}
              {!isStreaming && currentContent && (
                <>
                  <button onClick={saveCurrentAsTemplate} className="btn" style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem', background: '#10b981', color: 'white', border: 'none' }}>
                    💾 存储套路
                  </button>
                  <div style={{ display: 'flex', background: 'var(--code-bg)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-color)' }}>
                    <button onClick={exportToWord} style={{ padding: '0.3rem 0.65rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, background: 'transparent', color: 'var(--text-muted)', transition: 'all 0.2s' }} title="导出为 Word 文档">
                      📥 Word
                    </button>
                    <button onClick={exportToPDF} style={{ padding: '0.3rem 0.65rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, background: 'transparent', color: 'var(--text-muted)', transition: 'all 0.2s' }} title="导出为 PDF (打印)">
                      📄 PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {contentView === 'rendered' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
              
              {/* Word-style Ribbon Toolbar */}
              <div className="word-ribbon" style={{
                display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                padding: '4px 8px', gap: '2px',
                background: 'linear-gradient(180deg, var(--card-bg) 0%, var(--code-bg) 100%)',
                borderBottom: '1px solid var(--border-color)',
              }}>

                {/* Font Family Dropdown */}
                <select
                  value={typographyConfig.fontFamily}
                  onChange={e => updateTypoConfig('fontFamily', e.target.value)}
                  title="字体"
                  style={{ width: '120px', height: '26px', fontSize: '12px', padding: '0 4px', border: '1px solid var(--border-color)', borderRadius: '2px', background: 'var(--bg-color)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="inherit">默认字体</option>
                  <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">微软雅黑</option>
                  <option value="Georgia, 'Times New Roman', Times, serif">宋体/衬线</option>
                  <option value="'Courier New', Courier, monospace">等宽字体</option>
                </select>

                {/* Font Size Dropdown */}
                <select
                  value={typographyConfig.fontSize}
                  onChange={e => updateTypoConfig('fontSize', e.target.value)}
                  title="字号"
                  style={{ width: '52px', height: '26px', fontSize: '12px', padding: '0 2px', border: '1px solid var(--border-color)', borderRadius: '2px', background: 'var(--bg-color)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', marginRight: '4px' }}
                >
                  <option value="0.8rem">10</option>
                  <option value="0.85rem">11</option>
                  <option value="0.9rem">12</option>
                  <option value="1rem">14</option>
                  <option value="1.1rem">16</option>
                  <option value="1.15rem">18</option>
                  <option value="1.3rem">22</option>
                </select>

                {/* Separator */}
                <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 4px' }} />

                {/* Alignment Group */}
                {[
                  { key: 'left',    svg: 'M3 4h18v2H3zm0 4h12v2H3zm0 4h18v2H3zm0 4h12v2H3z', label: '左对齐' },
                  { key: 'center',  svg: 'M3 4h18v2H3zm3 4h12v2H6zM3 12h18v2H3zm3 4h12v2H6z', label: '居中' },
                  { key: 'justify', svg: 'M3 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3z', label: '两端对齐' },
                ].map(a => (
                  <button
                    key={a.key}
                    onClick={() => updateTypoConfig('align', a.key)}
                    title={a.label}
                    style={{
                      width: '28px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: typographyConfig.align === a.key ? '1px solid var(--primary-color)' : '1px solid transparent',
                      borderRadius: '2px', cursor: 'pointer',
                      background: typographyConfig.align === a.key ? 'rgba(99,102,241,0.1)' : 'transparent',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={typographyConfig.align === a.key ? 'var(--primary-color)' : 'var(--text-muted)'}><path d={a.svg}/></svg>
                  </button>
                ))}

                {/* Separator */}
                <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 4px' }} />

                {/* Preset Theme Dropdown */}
                <select
                  value={typographyConfig.preset}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '__new__') {
                      setEditingTheme({ ...defaultNewTheme });
                      setThemeEditorOpen(true);
                    } else {
                      updateTypoConfig('preset', val);
                    }
                  }}
                  title="排版主题"
                  style={{ height: '26px', fontSize: '12px', padding: '0 4px', border: '1px solid var(--border-color)', borderRadius: '2px', background: 'var(--bg-color)', color: 'var(--text-main)', outline: 'none', cursor: 'pointer' }}
                >
                  <optgroup label="预设主题">
                    <option value="typo-default">📐 系统默认</option>
                    <option value="typo-wechat-elegant">💚 微信公众号</option>
                    <option value="typo-zhihu">🔵 知乎专栏</option>
                  </optgroup>
                  {customThemes.length > 0 && (
                    <optgroup label="我的自定义">
                      {customThemes.map(ct => (
                        <option key={ct.id} value={ct.id}>🎨 {ct.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="───────────">
                    <option value="__new__">＋ 新建自定义主题...</option>
                  </optgroup>
                </select>

                {/* Edit current custom theme button */}
                {isCustomPreset && (
                  <button
                    onClick={() => { setEditingTheme({ ...getCustomThemeById(typographyConfig.preset) }); setThemeEditorOpen(true); }}
                    title="编辑当前自定义主题"
                    style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', borderRadius: '2px', background: 'transparent', cursor: 'pointer', fontSize: '12px' }}
                  >✏️</button>
                )}

              </div>

              {/* Content area */}
              {(() => {
                const customT = isCustomPreset ? getCustomThemeById(typographyConfig.preset) : null;
                const customInlineStyle = customT ? {
                  color: customT.bodyColor,
                  background: customT.bgColor,
                  letterSpacing: customT.letterSpacing,
                  lineHeight: customT.lineHeight,
                  borderRadius: '8px',
                } : {};
                return (
                  <div 
                    style={{ flex: 1, overflowY: 'auto', padding: '2rem 1.5rem', textAlign: typographyConfig.align, fontFamily: typographyConfig.fontFamily, fontSize: typographyConfig.fontSize, lineHeight: 1.8, ...customInlineStyle }} 
                    className={isCustomPreset ? '' : `${typographyConfig.preset} ${typographyConfig.preset.startsWith('typo-wechat-') ? 'typo-wechat-base' : ''}`}
                  >
                {currentContent ? (
                paragraphs.map((para, pIdx) => (
                  <div key={pIdx} style={{ marginBottom: '1.25rem', borderRadius: '8px', border: editingParagraph?.paraIdx === pIdx ? '2px solid var(--primary-color)' : '2px solid transparent', transition: 'border 0.2s' }}>
                    {/* Paragraph content */}
                    <div
                      style={{ padding: '0.75rem 1rem', background: editingParagraph?.paraIdx === pIdx ? 'var(--code-bg)' : 'transparent', borderRadius: '8px 8px 0 0' }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(para) }}
                    />
                    {/* Edit toolbar */}
                    {!isStreaming && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.25rem 1rem' }}>
                        {editingParagraph?.paraIdx === pIdx ? (
                          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
                            <input
                              autoFocus
                              placeholder="例如：把这段改得更幽默，增加一个实际案例..."
                              value={editingParagraph.instruction}
                              onChange={e => setEditingParagraph(prev => ({ ...prev, instruction: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && !editingParagraph.loading && handleReviseParagraph(pIdx, paragraphs)}
                              style={{ flex: 1, padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--primary-color)', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }}
                            />
                            <button
                              onClick={() => handleReviseParagraph(pIdx, paragraphs)}
                              disabled={editingParagraph.loading}
                              style={{ padding: '0.4rem 0.8rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                            >
                              {editingParagraph.loading ? '✨ AI处理中...' : '确认修改'}
                            </button>
                            <button onClick={() => setEditingParagraph(null)} style={{ padding: '0.4rem 0.6rem', background: 'var(--code-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)' }}>取消</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingParagraph({ paraIdx: pIdx, instruction: '', loading: false })}
                            style={{ padding: '0.2rem 0.6rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.7 }}
                          >
                            ✏️ AI 助手调整此段
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem' }}>
                  <div style={{ fontSize: '3rem', opacity: 0.5 }}>📝</div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 500 }}>AI 终稿将在这里以最佳排版渲染呈现。</span>
                </div>
              )}
              </div>
                );
              })()}
            </div>
          ) : (
            <textarea
              value={currentContent}
              onChange={e => setFinalContents(prev => { const u = [...prev]; u[cIdx] = { ...u[cIdx], content: e.target.value }; return u; })}
              style={{ flex: 1, padding: '2rem', marginTop: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--code-bg)', color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: '1.8', resize: 'none', outline: 'none' }}
              placeholder="Markdown 原文将在这里显示。"
            />
          )}
        </div>
      );
    }

    if (activePane === 'tools') {
      return renderToolsPane();
    }

    if (activePane === 'logs') {
      return renderLogsPane();
    }
  };

  const handleToggleTool = async (id, is_active) => {
    try {
      const res = await axios.put(`/tools/${id}/toggle`, { is_active });
      // Update local state
      const refreshed = await axios.get('/tools');
      setAvailableTools(refreshed.data);
      setSelectedToolsForGen(refreshed.data.filter(t => t.is_active).map(t => t.name));
    } catch (e) {
      alert("开关失败：" + (e.response?.data?.error || e.message));
    }
  };

  const handleDeleteTool = async (id) => {
    if (!window.confirm("确定移除此 MCP 接入节点？")) return;
    try {
      await axios.delete(`/tools/${id}`);
      const refreshed = await axios.get('/tools');
      setAvailableTools(refreshed.data);
    } catch(e) {
      alert("删除失败：" + (e.response?.data?.error || e.message));
    }
  };

  const handleAddMcp = async () => {
    if (!mcpForm.name || !mcpForm.config) return alert("参数缺失");
    try {
      if (editingToolId) {
        await axios.put(`/tools/${editingToolId}`, mcpForm);
      } else {
        await axios.post('/tools', mcpForm);
      }
      setMcpForm({ name: '', category: '内容库', config: '' });
      setIsAddingMcp(false);
      setEditingToolId(null);
      const refreshed = await axios.get('/tools');
      setAvailableTools(refreshed.data);
    } catch(e) {
      alert((editingToolId ? "更新" : "添加") + "失败：" + (e.response?.data?.error || e.message));
    }
  };

  const renderLogsPane = () => {
    return (
      <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0, overflowY: 'auto' }}>
        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📈</span> 本项目历史操作纪要
        </h3>
        {projectLogs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 'auto', opacity: 0.7 }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            当前项目还没有留下操作痕迹。
          </div>
        ) : (
          <div style={{ position: 'relative', borderLeft: '2px solid var(--border-color)', marginLeft: '1rem', paddingLeft: '1.5rem' }}>
            {projectLogs.map((log, idx) => (
              <div key={log.id} style={{ position: 'relative', marginBottom: idx === projectLogs.length - 1 ? 0 : '2rem' }}>
                {/* Timeline Dot */}
                <div style={{ position: 'absolute', top: 0, left: '-1.85rem', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--primary-color)', border: '2px solid var(--bg-color)', zIndex: 2 }} />
                
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '0.4rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>{log.action}</h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
                </div>
                {log.details && (
                  <div style={{ backgroundColor: 'var(--code-bg)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', wordBreak: 'break-all' }}>
                    {log.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderToolsPane = () => {
    return (
      <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>🧰 全局工具库</h3>
          <button className="btn" onClick={() => {
            if (isAddingMcp && !editingToolId) {
              setIsAddingMcp(false);
            } else {
              setMcpForm({ name: '', category: '内容库', config: '' });
              setEditingToolId(null);
              setIsAddingMcp(true);
            }
          }} style={{ padding: '0.4rem 0.8rem', background: (isAddingMcp && !editingToolId) ? 'var(--code-bg)' : 'var(--primary-color)', color: (isAddingMcp && !editingToolId) ? 'var(--text-main)' : 'white' }}>
            {(isAddingMcp && !editingToolId) ? '取消接入' : '➕ 接入外部 MCP 节点'}
          </button>
        </div>

        {isAddingMcp && (
          <div style={{ background: 'var(--code-bg)', padding: '1.25rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid var(--primary-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--primary-color)' }}>{editingToolId ? '修改 MCP 服务配置' : '连接 Model Context Protocol 服务'}</h4>
              {editingToolId && <button className="btn" onClick={() => { setIsAddingMcp(false); setEditingToolId(null); }} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>取消修改</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>MCP 服务名/标识</label>
                <input value={mcpForm.name} onChange={e => setMcpForm(p => ({...p, name: e.target.value}))} placeholder="例如：Private_Database" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>工具分类</label>
                <select value={mcpForm.category} onChange={e => setMcpForm(p => ({...p, category: e.target.value}))} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-main)', outline: 'none' }}>
                  <option value="内容库">内容库集成</option>
                  <option value="搜索工具">高级搜索增强</option>
                  <option value="逻辑推演">计算与逻辑演化</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.3rem' }}>启动 Config 配置参数 (JSON)</label>
              <textarea value={mcpForm.config} onChange={e => setMcpForm(p => ({...p, config: e.target.value}))} placeholder='{"mcp_endpoint": "http://127.0.0.1:8000/mcp", "api_key": "..."}' style={{ width: '100%', minHeight: '80px', fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>
            <button className="btn btn-primary" onClick={handleAddMcp} style={{ marginTop: '1rem', width: '100%' }}>✅ {editingToolId ? '确认更新此节点' : '确认保存此节点'}</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {availableTools.map(t => (
            <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--code-bg)', padding: '1.25rem', borderRadius: '12px', border: t.is_active ? '1px solid var(--primary-color)' : '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', background: t.type === 'BUILTIN' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)', color: t.type === 'BUILTIN' ? '#10b981' : '#6366f1', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>{t.type} · {t.category}</span>
                
                {/* Custom Toggle Switch */}
                <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px' }}>
                  <input type="checkbox" checked={t.is_active} onChange={e => handleToggleTool(t.id, e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.is_active ? 'var(--primary-color)' : 'var(--border-color)', transition: '.4s', borderRadius: '34px' }}>
                     <span style={{ position: 'absolute', height: '14px', width: '14px', left: t.is_active ? '22px' : '4px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%' }}></span>
                  </span>
                </label>
              </div>
              
              <h4 style={{ margin: '0.5rem 0 0.25rem' }}>{t.name === 'web_search' ? '🌐 DuckDuckGo 智能检索' : t.name}</h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {t.name === 'web_search' ? 
                 '内置安全实时网络爬行器，让大模型在写作或推演架构时自发抓取全网实效性资讯融入文案。' : 
                 (t.config || '连接到外部的私有知识库 / 功能模块池')}
              </p>

              {t.type === 'MCP' && (
                <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', cursor: 'pointer' }} onClick={() => {
                    setMcpForm({ name: t.name, category: t.category, config: t.config || '' });
                    setEditingToolId(t.id);
                    setIsAddingMcp(true);
                  }}>⚙️ 配置</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--danger-color)', cursor: 'pointer' }} onClick={() => handleDeleteTool(t.id)}>🗑️ 移除节点</span>
                </div>
              )}
            </div>
          ))}
          {availableTools.length === 0 && <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center', gridColumn: '1 / -1' }}>当前无可用工具，服务未初始化。</div>}
        </div>
      </div>
    );
  }




  const getMenuItemStyle = (id) => {
    let isActive = false;
    if (id === 'outline' && activePane.startsWith('outline-')) isActive = true;
    else if (id === 'content' && activePane.startsWith('content-')) isActive = true;
    else isActive = activePane === id;
    
    return {
      padding: '1rem 1.25rem', 
      cursor: 'pointer', 
      borderRadius: '10px', 
      fontWeight: isActive ? 600 : 500,
      backgroundColor: isActive ? 'var(--primary-color)' : 'transparent',
      color: isActive ? 'white' : 'var(--text-main)',
      marginBottom: '0.5rem',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      boxShadow: isActive ? 'var(--card-shadow)' : 'none'
    };
  };

  return (
    <div className="layout-wrapper" style={{ position: 'relative', overflow: 'hidden' }}>
      
      {/* 沉浸式环境背景光效 */}
      <div style={{ position: 'fixed', top: '-15%', left: '-10%', width: '40vw', height: '40vw', background: 'var(--primary-color)', filter: 'blur(120px)', opacity: 0.05, zIndex: 0, borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-15%', right: '-10%', width: '40vw', height: '40vw', background: '#10b981', filter: 'blur(120px)', opacity: 0.05, zIndex: 0, borderRadius: '50%', pointerEvents: 'none' }} />

      <nav className="navbar">
        <h2 style={{ color: 'var(--primary-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ✨ 智慧文案平台
        </h2>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => navigate('/')} style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>⬅️ 回主控台</button>
          
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '1rem' }} className="hide-on-mobile">已登入：{user.username}</span>
          
          <button className="btn" onClick={toggleTheme} style={{ width: '38px', height: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', borderRadius: '8px' }} title="切换夜间模式">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          
          <button className="btn" onClick={() => setShowConfig(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>⚙️ 配置</button>
          <button className="btn btn-danger" onClick={logout} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>退出</button>
        </div>
      </nav>

      <div className="workspace-layout" style={{ position: 'relative', zIndex: 10 }}>
        
        {/* Left Panel: Navigation Drawer */}
        <div className="sidebar" style={{ background: 'var(--nav-bg)', backdropFilter: 'blur(10px)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: '0 8px 30px rgba(0,0,0,0.02)' }}>
          
          <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '1.5rem', paddingLeft: '0.5rem', marginTop: '0.5rem' }}>
             Workflow Pipeline
          </h4>
          
          <div style={getMenuItemStyle('input')} onClick={() => setActivePane('input')}>
            <span>🎯</span> 主要要求
          </div>

          <div 
            style={{ 
              ...getMenuItemStyle('templates'),
              opacity: 1,
            }}
            onClick={() => setActivePane('templates')}
          >
            <span>📚</span> 套路模板
            {savedTemplates.length > 0 && <span style={{ fontSize: '0.7rem', background: 'var(--primary-color)', color: 'white', borderRadius: '100px', padding: '0.1rem 0.45rem', marginLeft: 'auto' }}>{savedTemplates.length}</span>}
          </div>

          <div 
            style={getMenuItemStyle('tools')}
            onClick={() => setActivePane('tools')}
          >
            <span>🧰</span> 工具中心
          </div>

          <div 
            style={getMenuItemStyle('logs')}
            onClick={() => setActivePane('logs')}
          >
            <span>📈</span> 项目日志
          </div>

          <div 
             style={{ 
               ...getMenuItemStyle('outline'), 
               opacity: outlines.length > 0 || isGeneratingOutline ? 1 : 0.5,
               cursor: outlines.length > 0 ? 'pointer' : 'default'
             }} 
             onClick={() => outlines.length > 0 && setActivePane('outline-0')}
          >
            <span>📝</span> 文章大纲
          </div>
          
          {/* Submenu for outlines (Accordion expanded content) */}
          {outlines.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '1rem', gap: '0.25rem', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
              {outlines.map((out, idx) => {
                const isSelected = activePane === `outline-${idx}`;
                return (
                  <div
                    key={idx}
                    style={{
                      borderRadius: '8px', fontSize: '0.85rem', overflow: 'hidden',
                      backgroundColor: isSelected ? 'var(--code-bg)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--primary-color)' : '3px solid transparent',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Name row */}
                    <div
                      style={{ padding: '0.55rem 0.75rem', cursor: 'pointer', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontWeight: isSelected ? 600 : 400 }}
                      onClick={() => setActivePane(`outline-${idx}`)}
                    >
                      {out?.variantName || `预演版本 ${idx + 1}`}
                    </div>
                    {/* Action buttons - only shown when selected */}
                    {isSelected && (
                      <div style={{ display: 'flex', gap: '0.25rem', padding: '0 0.5rem 0.5rem' }}>
                        <button
                          title="重新生成此大纲"
                          disabled={isGeneratingOutline}
                          onClick={e => { e.stopPropagation(); regenerateOutlineVariant(idx); }}
                          style={{ flex: 1, fontSize: '0.7rem', padding: '0.25rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          {isGeneratingOutline ? '⏳' : '🔄 重新生成'}
                        </button>
                        <button
                          title="删除此大纲"
                          onClick={e => { e.stopPropagation(); deleteOutlineVariant(idx); }}
                          style={{ flex: 1, fontSize: '0.7rem', padding: '0.25rem', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', background: 'rgba(239,68,68,0.05)', color: 'var(--danger-color)', cursor: 'pointer' }}
                        >
                          🗑️ 删除
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Add new variant button */}
              <button
                onClick={addNewOutlineVariant}
                disabled={isGeneratingOutline}
                style={{ marginTop: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.75rem', background: 'transparent', border: '1px dashed var(--primary-color)', color: 'var(--primary-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                {isGeneratingOutline ? '⏳ 生成中...' : '➕ 新增一个大纲变体'}
              </button>
            </div>
          )}

          {/* Final contents submenu */}
          <div 
            style={{ 
              ...getMenuItemStyle('content'),
              opacity: finalContents.length > 0 || isGeneratingContent ? 1 : 0.5,
              cursor: finalContents.length > 0 ? 'pointer' : 'default',
            }} 
            onClick={() => finalContents.length > 0 && setActivePane(`content-${activeContentIdx}`)}
          >
            <span>✨</span> 最后成品
          </div>
          {finalContents.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '1rem', gap: '0.25rem', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
              {finalContents.map((fc, cIdx) => {
                const isSelected = activePane === `content-${cIdx}`;
                return (
                  <div
                    key={fc.id}
                    style={{
                      padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer',
                      backgroundColor: isSelected ? 'var(--code-bg)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--primary-color)' : '3px solid transparent',
                      color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)',
                      fontWeight: isSelected ? 600 : 400,
                      transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}
                    onClick={() => { setActiveContentIdx(cIdx); setActivePane(`content-${cIdx}`); }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{fc.name}</span>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
                      {isGeneratingContent && cIdx === finalContents.length - 1 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--primary-color)' }}>⌛</span>
                      )}
                      {isSelected && !(isGeneratingContent && cIdx === finalContents.length - 1) && (
                        <button
                          title="删除此成品"
                          onClick={e => { e.stopPropagation(); deleteContentVariant(cIdx); }}
                          style={{ padding: '0.1rem 0.35rem', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--danger-color)', lineHeight: 1 }}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
        </div>

        {/* Right Panel: Content Editor */}
        <div className="main-panel">
          {renderActivePane()}
        </div>
      </div>
      
      {showConfig && <ConfigModal onClose={() => setShowConfig(false)} />}

      {/* Custom Theme Editor Modal */}
      {themeEditorOpen && (() => {
        const t = editingTheme || { ...defaultNewTheme };
        const set = (k, v) => setEditingTheme(prev => ({ ...(prev || defaultNewTheme), [k]: v }));
        const headingStyleLabel = { 'left-border': '左边条', 'center': '居中', 'center-lines': '居中+左右横线', 'pill': '胶囊标签' };
        const isDark = t.bgColor && parseInt(t.bgColor.replace('#',''), 16) < 0x666666;
        
        // Generate live preview heading style
        const previewH2Style = (() => {
          switch(t.headingStyle) {
            case 'center': return { color: t.accentColor, textAlign: 'center', border: 'none' };
            case 'center-lines': return { color: t.accentColor, textAlign: 'center', border: 'none' };
            case 'pill': return { color: '#fff', background: t.accentColor, padding: '0.4em 1em', borderRadius: '100px', display: 'inline-block', textAlign: 'center', fontSize: '0.95em' };
            default: return { color: t.accentColor, borderLeft: `4px solid ${t.accentColor}`, paddingLeft: '10px' };
          }
        })();

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => { setThemeEditorOpen(false); setEditingTheme(null); }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', width: '680px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              
              {/* Modal Header */}
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>🎨 自定义排版主题</h3>
                <button onClick={() => { setThemeEditorOpen(false); setEditingTheme(null); }} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              </div>

              <div style={{ padding: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                
                {/* Left: Controls */}
                <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Theme Name */}
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>主题名称</label>
                    <input value={t.name} onChange={e => set('name', e.target.value)} style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-color)', color: 'var(--text-main)', outline: 'none', fontSize: '0.9rem' }} />
                  </div>

                  {/* Color Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {[
                      { key: 'accentColor', label: '主题强调色' },
                      { key: 'strongColor', label: '加粗文字色' },
                      { key: 'bodyColor', label: '正文颜色' },
                      { key: 'bgColor', label: '背景色' },
                      { key: 'blockquoteBg', label: '引用块底色' },
                    ].map(c => (
                      <div key={c.key}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>{c.label}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input type="color" value={t[c.key]} onChange={e => set(c.key, e.target.value)} style={{ width: '32px', height: '28px', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', padding: 0 }} />
                          <input value={t[c.key]} onChange={e => set(c.key, e.target.value)} style={{ flex: 1, padding: '0.3rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.78rem', fontFamily: 'monospace', outline: 'none' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Heading Style */}
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>标题装饰风格</label>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {Object.entries(headingStyleLabel).map(([k, v]) => (
                        <button key={k} onClick={() => set('headingStyle', k)} style={{
                          padding: '0.35rem 0.75rem', fontSize: '0.78rem', borderRadius: '6px', cursor: 'pointer',
                          border: t.headingStyle === k ? `2px solid ${t.accentColor}` : '1px solid var(--border-color)',
                          background: t.headingStyle === k ? (t.accentColor + '18') : 'var(--bg-color)',
                          color: t.headingStyle === k ? t.accentColor : 'var(--text-muted)', fontWeight: 600,
                        }}>{v}</button>
                      ))}
                    </div>
                  </div>

                  {/* Spacing */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>字间距</label>
                      <select value={t.letterSpacing} onChange={e => set('letterSpacing', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.8rem', outline: 'none' }}>
                        <option value="0px">无 (0px)</option>
                        <option value="0.5px">紧凑 (0.5px)</option>
                        <option value="1px">标准 (1px)</option>
                        <option value="2px">宽松 (2px)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>行高</label>
                      <select value={t.lineHeight} onChange={e => set('lineHeight', e.target.value)} style={{ width: '100%', padding: '0.4rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.8rem', outline: 'none' }}>
                        <option value="1.5">紧凑 (1.5)</option>
                        <option value="1.8">标准 (1.8)</option>
                        <option value="2.0">舒适 (2.0)</option>
                        <option value="2.2">宽松 (2.2)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Right: Live Preview */}
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>实时预览</label>
                  <div style={{
                    background: t.bgColor, color: t.bodyColor, padding: '1.25rem', borderRadius: '8px',
                    border: '1px solid var(--border-color)', letterSpacing: t.letterSpacing, lineHeight: t.lineHeight,
                    fontSize: '0.85rem', minHeight: '200px',
                  }}>
                    <h2 style={{ ...previewH2Style, fontSize: '1.1rem', margin: '0 0 0.8em' }}>
                      {t.headingStyle === 'center-lines' && <span style={{ display: 'inline-block', width: '24px', height: '1px', background: t.accentColor, verticalAlign: 'middle', marginRight: '8px' }} />}
                      这是标题样式
                      {t.headingStyle === 'center-lines' && <span style={{ display: 'inline-block', width: '24px', height: '1px', background: t.accentColor, verticalAlign: 'middle', marginLeft: '8px' }} />}
                    </h2>
                    <p style={{ marginBottom: '0.8em', textAlign: 'center' }}>这是正文段落内容，用于预览整体排版效果。<strong style={{ color: t.strongColor }}>加粗文字</strong>。</p>
                    <div style={{ background: t.blockquoteBg, borderLeft: `3px solid ${t.accentColor}`, padding: '0.6em 0.8em', borderRadius: '4px', color: isDark ? '#94a3b8' : '#666', fontSize: '0.85em', marginBottom: '0.8em' }}>
                      引用文字效果预览
                    </div>
                    <p style={{ marginBottom: 0, textAlign: 'center', fontSize: '0.8em', opacity: 0.6 }}>— 尾部效果 —</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {t.id && (
                    <button onClick={() => { deleteCustomTheme(t.id); setThemeEditorOpen(false); setEditingTheme(null); }} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                      🗑 删除此主题
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => { setThemeEditorOpen(false); setEditingTheme(null); }} style={{ padding: '0.5rem 1rem', background: 'var(--code-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>取消</button>
                  <button onClick={() => saveCustomTheme(t)} style={{ padding: '0.5rem 1.5rem', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>💾 保存主题</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
