import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase';
import './styles.css';

const categories = ['Todos', 'Moda', 'Alimentação', 'Serviços', 'Casa', 'Beleza'];

function slugify(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

async function ensureProfileAndCatalog(user, fullName) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id, full_name, role').eq('id', user.id).maybeSingle();
  if (profileError) throw profileError;

  if (!profile) {
    const { error } = await supabase.from('profiles').insert({ id: user.id, full_name: fullName, role: 'user' });
    if (error) throw error;
  }

  const { data: catalog, error: catalogError } = await supabase
    .from('catalogs').select('*').eq('owner_id', user.id).maybeSingle();
  if (catalogError) throw catalogError;

  if (!catalog) {
    const base = slugify(fullName || user.email?.split('@')[0] || 'catalogo') || 'catalogo';
    const slug = `${base}-${user.id.slice(0, 6)}`;
    const { data, error } = await supabase.from('catalogs').insert({
      owner_id: user.id,
      slug,
      company_name: fullName || 'Meu catálogo',
      description: 'Meu catálogo no DEMONTAO.NET',
      is_active: false
    }).select('*').single();
    if (error) throw error;
    return data;
  }
  return catalog;
}

function AuthScreen({ mode, setMode, onAuthenticated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!supabase) return setMessage('Supabase não está configurado.');
    if (!form.email || !form.password || (mode === 'signup' && !form.name)) {
      return setMessage('Preencha todos os campos.');
    }
    setLoading(true); setMessage('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { full_name: form.name.trim() } }
        });
        if (error) throw error;
        if (data.user && data.session) {
          const catalog = await ensureProfileAndCatalog(data.user, form.name.trim());
          onAuthenticated(data.user, catalog);
        } else {
          setMessage('Cadastro criado. Verifique seu e-mail para confirmar a conta e depois entre.');
          setMode('login');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(), password: form.password
        });
        if (error) throw error;
        const user = data.user;
        const catalog = await ensureProfileAndCatalog(user, user.user_metadata?.full_name || '');
        onAuthenticated(user, catalog);
      }
    } catch (error) {
      setMessage(error.message || 'Não foi possível concluir a operação.');
    } finally { setLoading(false); }
  };

  return <main className="auth-page">
    <section className="auth-card">
      <div className="brand auth-brand">DEMONTAO.NET</div>
      <span className="eyebrow">{mode === 'login' ? 'ACESSAR CONTA' : 'CRIAR CONTA'}</span>
      <h1>{mode === 'login' ? 'Bem-vindo de volta.' : 'Crie seu catálogo.'}</h1>
      <p className="auth-subtitle">{mode === 'login' ? 'Entre para administrar seus produtos, serviços e pedidos.' : 'Cadastre sua conta e comece a montar seu catálogo digital.'}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} autoComplete="name" /></label>}
        <label>E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} autoComplete="email" /></label>
        <label>Senha<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {message && <div className="form-message">{message}</div>}
        <button className="primary-button" disabled={loading}>{loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar minha conta'}</button>
      </form>
      <button className="text-button" onClick={()=>{setMode(mode==='login'?'signup':'login');setMessage('')}}>
        {mode === 'login' ? 'Ainda não tenho conta' : 'Já tenho uma conta'}
      </button>
    </section>
  </main>;
}

function OwnerDashboard({ user, catalog, onLogout }) {
  const [currentCatalog, setCurrentCatalog] = useState(catalog);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [companyName, setCompanyName] = useState(catalog?.company_name || '');

  const save = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    const { data, error } = await supabase.from('catalogs')
      .update({ company_name: companyName.trim() || 'Meu catálogo', updated_at: new Date().toISOString() })
      .eq('id', currentCatalog.id).select('*').single();
    if (error) setMessage(error.message);
    else { setCurrentCatalog(data); setMessage('Dados salvos.'); }
    setSaving(false);
  };

  return <main className="dashboard-page">
    <header className="dashboard-topbar">
      <div><div className="brand">DEMONTAO.NET</div><span className="dashboard-label">PAINEL DO CATÁLOGO</span></div>
      <button className="secondary-button" onClick={onLogout}>Sair</button>
    </header>
    <section className="dashboard-content">
      <div className="dashboard-intro"><span className="eyebrow">OLÁ</span><h1>{currentCatalog.company_name || 'Meu catálogo'}</h1><p>Seu painel para organizar o catálogo digital.</p></div>
      <div className="status-card"><div><strong>Status do catálogo</strong><span>{currentCatalog.is_active ? 'Ativo' : 'Aguardando ativação do plano'}</span></div><span className={currentCatalog.is_active ? 'status-dot active' : 'status-dot'}></span></div>
      <div className="dashboard-grid">
        <article className="panel"><span className="eyebrow">CATÁLOGO</span><h2>Dados da empresa</h2><form onSubmit={save} className="auth-form">
          <label>Nome da empresa<input value={companyName} onChange={e=>setCompanyName(e.target.value)} /></label>
          {message && <div className="form-message success">{message}</div>}
          <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
        </form></article>
        <article className="panel"><span className="eyebrow">PRÓXIMOS PASSOS</span><h2>Monte seu catálogo</h2><div className="feature-list"><div><b>01</b><span>Adicionar categorias</span></div><div><b>02</b><span>Cadastrar produtos e serviços</span></div><div><b>03</b><span>Personalizar sua página</span></div><div><b>04</b><span>Receber pedidos</span></div></div></article>
      </div>
    </section>
  </main>;
}

function App() {
  const [view, setView] = useState('home');
  const [authMode, setAuthMode] = useState('login');
  const [user, setUser] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleSession = async (sessionUser) => {
    if (!sessionUser) { setUser(null); setCatalog(null); setView('home'); setLoading(false); return; }
    try {
      const c = await ensureProfileAndCatalog(sessionUser, sessionUser.user_metadata?.full_name || '');
      setUser(sessionUser); setCatalog(c); setView('dashboard');
    } catch (error) {
      console.error(error); setView('dashboard');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!supabase) return setLoading(false);
    supabase.auth.getSession().then(({ data }) => handleSession(data.session?.user || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) handleSession(session.user);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="loading-screen">DEMONTAO.NET</div>;
  if (view === 'auth') return <AuthScreen mode={authMode} setMode={setAuthMode} onAuthenticated={handleSession} />;
  if (view === 'dashboard' && user && catalog) return <OwnerDashboard user={user} catalog={catalog} onLogout={async()=>{await supabase.auth.signOut(); setUser(null); setCatalog(null); setView('home')}} />;

  return <main className="app">
    <header className="topbar"><div className="brand">DEMONTAO.NET</div><button className="login" onClick={()=>{setAuthMode('login');setView('auth')}}>Entrar</button></header>
    <section className="hero"><div><span className="eyebrow">CATÁLOGO DIGITAL</span><h1>Encontre produtos e serviços.</h1><p>Explore catálogos de empresas, escolha o que precisa e faça seu pedido de forma simples.</p></div><div className="hero-card" aria-hidden="true"><div className="hero-card-top"></div><div className="hero-card-lines"><i></i><i></i><i></i></div></div></section>
    <section className="content"><div className="section-heading"><div><span className="eyebrow">EXPLORAR</span><h2>Destaques</h2></div><div className="search">Buscar produtos ou serviços</div></div><div className="categories">{categories.map((category,index)=><button className={index===0?'category active':'category'} key={category}>{category}</button>)}</div><div className="empty-state"><div className="empty-icon">+</div><h3>Seu catálogo começa aqui</h3><p>Os produtos e serviços cadastrados pelos lojistas aparecerão nesta área.</p></div></section>
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);