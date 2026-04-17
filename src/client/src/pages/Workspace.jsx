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
  
  const [outlines, setOutlines] = useState([]);
  const [articleId, setArticleId] = useState(null);
  
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
  
  // Templates state
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [viewingTemplate, setViewingTemplate] = useState(null); // for detail view
  const [editingTemplateOutline, setEditingTemplateOutline] = useState(null); // editable outline in template detail

  useEffect(() => {
    if (!projectId) return;
    setArticleId(projectId);
    fetchProject();
  }, [projectId]);

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

    } catch(e) {
      console.error("加载资源异常", e);
    }
  };

  const generateOutline = async () => {
    if (!topic) return alert("主题不能为空");
    setIsGeneratingOutline(true);
    setOutlines([]);
    try {
      const { data } = await axios.post('/workflow/outline', { articleId: projectId, topic, audience, customStyle: style });
      const parsedOutlines = data.outline.outlines || data.outline;
      if (Array.isArray(parsedOutlines) && parsedOutlines.length > 0) {
        setOutlines(parsedOutlines);
        setActivePane('outline-0');
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
      // Pass existing variants so AI generates a non-repetitive new one
      const { data } = await axios.post('/workflow/outline', {
        articleId: projectId, topic, audience, customStyle: style,
        existingVariants: outlines.map(o => ({ variantName: o.variantName, core_idea: o.core_idea })),
        generateCount: 1
      });
      const parsed = data.outline.outlines || data.outline;
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Use the AI's own variantName directly — it's content-aware
        const newVariant = parsed[0];
        const merged = [...outlines, newVariant];
        setOutlines(merged);
        setActivePane(`outline-${merged.length - 1}`);
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
      alert("存档失败！");
    }
  };

  const deleteTemplate = async (templateId) => {
    if (!window.confirm('确定删除这个套路模板？')) return;
    try {
      await axios.delete(`/template/${templateId}`);
      setSavedTemplates(prev => prev.filter(t => t.id !== templateId));
      if (viewingTemplate?.id === templateId) setViewingTemplate(null);
    } catch (e) {
      alert('删除失败');
    }
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
        body: JSON.stringify({ articleId, final_outline: outlineToUse, contentName: outlineName })
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
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            每个模板都由 AI 自动提炼抽象写作模式，可应用到任何新主题上。
          </p>
          {savedTemplates.length === 0 ? (
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

            return (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <button onClick={() => { setViewingTemplate(null); setEditingTemplateOutline(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem', padding: 0 }}>← 返回列表</button>
                
                {/* AI Abstract Summary */}
                <div style={{ background: 'var(--code-bg)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: 'var(--primary-color)' }}>{viewingTemplate.name}</h4>
                  {abs.writing_strategy && <p style={{ fontSize: '0.85rem', margin: '0.4rem 0', lineHeight: 1.6, color: 'var(--text-muted)' }}>🎯 {abs.writing_strategy}</p>}
                  {abs.emotional_arc && <p style={{ fontSize: '0.85rem', margin: '0.4rem 0', lineHeight: 1.6, color: 'var(--text-muted)' }}>🌊 {abs.emotional_arc}</p>}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {(abs.key_techniques || []).map((t, i) => <span key={i} style={{ padding: '0.15rem 0.5rem', borderRadius: '100px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.7rem', color: 'var(--primary-color)' }}>{t}</span>)}
                  </div>
                </div>

                {/* Editable Outline Content */}
                <h4 style={{ marginBottom: '0.75rem' }}>✏️ 大纲内容（可修改后应用）</h4>

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

                <div style={{ display: 'flex', gap: '0.75rem', position: 'sticky', bottom: 0, background: 'var(--card-bg)', padding: '0.75rem 0' }}>
                  <button className="btn btn-primary" style={{ flex: 1, padding: '0.8rem' }} onClick={handleApplyTemplate}>⚡ 应用到当前项目</button>
                  <button className="btn" style={{ padding: '0.8rem', background: 'rgba(239,68,68,0.08)', color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.3)' }} onClick={() => deleteTemplate(viewingTemplate.id)}>🗑️ 删除</button>
                </div>
              </div>
            );
          })() : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {savedTemplates.map(t => {
                let abs = {};
                try { const p = JSON.parse(t.framework); abs = p.abstract || {}; } catch {}
                return (
                  <div key={t.id} style={{ background: 'var(--code-bg)', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s' }}
                    onClick={() => setViewingTemplate(t)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem' }}>⚡ {t.name}</h4>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                    {abs.writing_strategy && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{abs.writing_strategy}</p>}
                    {abs.emotional_arc && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--primary-color)' }}>🌊 {abs.emotional_arc}</p>}
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

          <h3 style={{ marginBottom: '1.5rem' }}>主要要求</h3>
          <div style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: '1.8' }}>
            在此填入你想创作的文章内核大方向与受众。大模型将在底层自动为你发散思维，
            一次性推演并提取 <strong style={{color: 'var(--primary-color)'}}>3 个不同风格和切入视角的候选项大纲</strong>。
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
               <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>文章核心主题 (必填)</label>
               <input placeholder="例如：大模型技术是如何颠覆现代前端开发工作流的" value={topic} onChange={e => setTopic(e.target.value)} />
            </div>
            <div>
               <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>目标受众人群 (可选)</label>
               <input placeholder="例如：已经有2年经验的 React 开发者" value={audience} onChange={e => setAudience(e.target.value)} />
            </div>
            <div>
               <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>期望基调风格或特定要求 (可选)</label>
               <input placeholder="例如：语言要幽默风趣带点自黑，多讲干货" value={style} onChange={e => setStyle(e.target.value)} />
            </div>
          </div>
          
          <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
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
                  background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '12px', 
                  padding: '1.5rem', marginBottom: '1.5rem', position: 'relative', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
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
                    style={{ fontSize: '1.1rem', fontWeight: 600, border: 'none', borderBottom: '1px dashed var(--border-color)', padding: '0.5rem 0', width: '100%', marginBottom: '1rem', background: 'transparent', color: 'var(--text-main)', outline: 'none' }}
                  />
                  <textarea 
                    placeholder="请详述该段落起承转合的核心逻辑与具体要讲解的内容..."
                    value={s.desc || ''} 
                    onChange={e => updateSection(i, 'desc', e.target.value)} 
                    style={{ width: '100%', minHeight: '80px', border: 'none', background: 'transparent', resize: 'vertical', fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: '1.6', outline: 'none', marginBottom: '0.5rem' }}
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

      return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', margin: 0 }}>
          <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <span>最后成品</span>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {currentContent && (
                <div style={{ display: 'flex', background: 'var(--code-bg)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-color)' }}>
                  <button onClick={() => setContentView('rendered')} style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: contentView === 'rendered' ? 'var(--primary-color)' : 'transparent', color: contentView === 'rendered' ? 'white' : 'var(--text-muted)', transition: 'all 0.2s' }}>📄 渲染视图</button>
                  <button onClick={() => setContentView('raw')} style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: contentView === 'raw' ? 'var(--primary-color)' : 'transparent', color: contentView === 'raw' ? 'white' : 'var(--text-muted)', transition: 'all 0.2s' }}>📝 Markdown 原文</button>
                </div>
              )}
              {!isStreaming && currentContent && (
                <button onClick={saveCurrentAsTemplate} className="btn" style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem', background: '#10b981', color: 'white', border: 'none' }}>
                  💾 存储套路
                </button>
              )}
              {isStreaming && <span style={{ fontSize: '0.9rem', color: 'var(--primary-color)', fontWeight: 'normal' }}>正在生成中...</span>}
            </div>
          </h3>

          {contentView === 'rendered' ? (
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
              {currentContent ? (
                paragraphs.map((para, pIdx) => (
                  <div key={pIdx} style={{ marginBottom: '1.25rem', borderRadius: '8px', border: editingParagraph?.paraIdx === pIdx ? '2px solid var(--primary-color)' : '2px solid transparent', transition: 'border 0.2s' }}>
                    {/* Paragraph content */}
                    <div
                      style={{ padding: '0.75rem 1rem', lineHeight: '1.9', background: editingParagraph?.paraIdx === pIdx ? 'var(--code-bg)' : 'transparent', borderRadius: '8px 8px 0 0' }}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <span style={{ color: 'var(--text-muted)' }}>AI 终稿将在这里渲染展示。</span>
                </div>
              )}
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

  };


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
    <div className="layout-wrapper">
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

      <div className="workspace-layout">
        
        {/* Left Panel: Navigation Drawer */}
        <div className="sidebar">
          
          <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '1.5rem', paddingLeft: '0.5rem' }}>
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
    </div>
  );
}
