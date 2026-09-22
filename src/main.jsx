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
  const [tab, setTab] = useState('overview');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const emptyProductForm = { name: '', description: '', price: '', stock: '', category_id: '', status: 'active' };
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productImage, setProductImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [settings, setSettings] = useState({ company_name: catalog?.company_name || '', description: catalog?.description || '', whatsapp: catalog?.whatsapp || '', address: catalog?.address || '', hours: catalog?.hours || '', instagram_url: catalog?.instagram_url || '', facebook_url: catalog?.facebook_url || '', primary_color: catalog?.primary_color || '#111827', secondary_color: catalog?.secondary_color || '#6b7280', background_color: catalog?.background_color || '#f7f7f5', button_color: catalog?.button_color || '#111827', theme: catalog?.theme || 'Minimalista', logo_url: catalog?.logo_url || '', cover_url: catalog?.cover_url || '' });
  const [savingItem, setSavingItem] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    if (!catalog?.id || !supabase) return;
    Promise.all([
      supabase.from('categories').select('*').eq('catalog_id', catalog.id).order('sort_order').order('created_at'),
      supabase.from('products').select('*, product_images(*)').eq('catalog_id', catalog.id).order('created_at', { ascending: false })
    ]).then(([cats, prods]) => {
      if (cats.error) setCatalogError(cats.error.message); else setCategories(cats.data || []);
      if (prods.error) setCatalogError(prods.error.message); else setProducts(prods.data || []);
    });
  }, [catalog?.id]);

  const addCategory = async (event) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setSavingItem(true); setCatalogError('');
    const { data, error } = await supabase.from('categories').insert({
      catalog_id: catalog.id, name: categoryName.trim(), sort_order: categories.length, is_active: true
    }).select('*').single();
    if (error) setCatalogError(error.message);
    else { setCategories([...categories, data]); setCategoryName(''); }
    setSavingItem(false);
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    if (!productForm.name.trim()) return;
    setSavingItem(true); setCatalogError('');
    const payload = {
      catalog_id: catalog.id,
      category_id: productForm.category_id || null,
      name: productForm.name.trim(),
      description: productForm.description.trim() || null,
      price: productForm.price === '' ? null : Number(productForm.price),
      stock: productForm.stock === '' ? null : Number(productForm.stock),
      status: productForm.status
    };
    const query = editingProduct
      ? supabase.from('products').update(payload).eq('id', editingProduct.id).select('*').single()
      : supabase.from('products').insert(payload).select('*').single();
    const { data, error } = await query;
    if (error) setCatalogError(error.message);
    else {
      if (editingProduct) setProducts(products.map(item => item.id === data.id ? { ...data, product_images: item.product_images || [] } : item));
      else setProducts([{ ...data, product_images: [] }, ...products]);
      setProductForm(emptyProductForm);
      setEditingProduct(null);
      setProductImage(null);
    }
    setSavingItem(false);
  };

  const editProduct = (item) => {
    setEditingProduct(item);
    setProductForm({
      name: item.name || '',
      description: item.description || '',
      price: item.price ?? '',
      stock: item.stock ?? '',
      category_id: item.category_id || '',
      status: item.status || 'active'
    });
    setProductImage(null);
    setCatalogError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setProductImage(null);
    setCatalogError('');
  };

  const uploadProductImage = async () => {
    if (!editingProduct || !productImage) return;
    setUploadingImage(true); setCatalogError('');
    try {
      const ext = productImage.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${catalog.id}/products/${editingProduct.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('catalog-images').upload(path, productImage, { contentType: productImage.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('catalog-images').getPublicUrl(path);
      const { data: imageRow, error: imageError } = await supabase.from('product_images').insert({ product_id: editingProduct.id, image_url: publicData.publicUrl, sort_order: (editingProduct.product_images || []).length }).select('*').single();
      if (imageError) throw imageError;
      setProducts(products.map(item => item.id === editingProduct.id ? { ...item, product_images: [...(item.product_images || []), imageRow] } : item));
      setEditingProduct({ ...editingProduct, product_images: [...(editingProduct.product_images || []), imageRow] });
      setProductImage(null);
    } catch (error) {
      setCatalogError(error.message || 'Não foi possível enviar a imagem.');
    } finally { setUploadingImage(false); }
  };

  const deleteProductImage = async (image) => {
    const { error } = await supabase.from('product_images').delete().eq('id', image.id);
    if (error) return setCatalogError(error.message);
    const pathMarker = '/catalog-images/';
    const idx = image.image_url?.indexOf(pathMarker);
    if (idx >= 0) {
      const path = image.image_url.slice(idx + pathMarker.length).split('?')[0];
      await supabase.storage.from('catalog-images').remove([path]);
    }
    const nextImages = (editingProduct?.product_images || []).filter(item => item.id !== image.id);
    setEditingProduct(editingProduct ? { ...editingProduct, product_images: nextImages } : editingProduct);
    setProducts(products.map(item => item.id === image.product_id ? { ...item, product_images: nextImages } : item));
  };

  const saveCatalogSettings = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    const payload = {
      company_name: settings.company_name.trim() || 'Meu catálogo',
      description: settings.description.trim() || null,
      whatsapp: settings.whatsapp.trim() || null,
      address: settings.address.trim() || null,
      hours: settings.hours.trim() || null,
      instagram_url: settings.instagram_url.trim() || null,
      facebook_url: settings.facebook_url.trim() || null,
      primary_color: settings.primary_color,
      secondary_color: settings.secondary_color,
      background_color: settings.background_color,
      button_color: settings.button_color,
      theme: settings.theme,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('catalogs').update(payload).eq('id', currentCatalog.id).select('*').single();
    if (error) setMessage(error.message);
    else { setCurrentCatalog(data); setSettings({ ...settings, ...data }); setMessage('Personalização salva.'); }
    setSaving(false);
  };

  const deleteCategory = async (id) => {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) return setCatalogError(error.message);
    setCategories(categories.filter(item => item.id !== id));
  };

  const deleteProduct = async (id) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return setCatalogError(error.message);
    setProducts(products.filter(item => item.id !== id));
  };
  const [currentCatalog, setCurrentCatalog] = useState(catalog);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [companyName, setCompanyName] = useState(catalog?.company_name || '');
  useEffect(() => { if (catalog) { setCurrentCatalog(catalog); setCompanyName(catalog.company_name || ''); setSettings(prev => ({...prev, ...catalog, company_name: catalog.company_name || ''})); } }, [catalog]);

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
      <nav className="dashboard-nav">
        <button className={tab==='overview'?'nav-item active':'nav-item'} onClick={()=>setTab('overview')}>Visão geral</button>
        <button className={tab==='categories'?'nav-item active':'nav-item'} onClick={()=>setTab('categories')}>Categorias</button>
        <button className={tab==='products'?'nav-item active':'nav-item'} onClick={()=>setTab('products')}>Produtos e serviços</button>
        <button className={tab==='customize'?'nav-item active':'nav-item'} onClick={()=>setTab('customize')}>Personalizar catálogo</button>
      </nav>
      <div className="dashboard-intro"><span className="eyebrow">OLÁ</span><h1>{currentCatalog.company_name || 'Meu catálogo'}</h1><p>Seu painel para organizar o catálogo digital.</p></div>
      <div className="status-card"><div><strong>Status do catálogo</strong><span>{currentCatalog.is_active ? 'Ativo' : 'Aguardando ativação do plano'}</span></div><span className={currentCatalog.is_active ? 'status-dot active' : 'status-dot'}></span></div>
      {catalogError && <div className="form-message">{catalogError}</div>}
      {tab === 'overview' && <div className="dashboard-grid">
        <article className="panel"><span className="eyebrow">CATÁLOGO</span><h2>Dados da empresa</h2><form onSubmit={save} className="auth-form">
          <label>Nome da empresa<input value={companyName} onChange={e=>setCompanyName(e.target.value)} /></label>
          {message && <div className="form-message success">{message}</div>}
          <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
        </form></article>
        <article className="panel"><span className="eyebrow">PRÓXIMOS PASSOS</span><h2>Monte seu catálogo</h2><div className="feature-list"><div><b>01</b><span>Adicionar categorias</span></div><div><b>02</b><span>Cadastre categorias</span></div><div><b>03</b><span>Cadastre produtos e serviços</span></div><div><b>04</b><span>Personalize sua página</span></div></div></article>
      </div>}
      {tab === 'categories' && <article className="panel catalog-manager">
        <span className="eyebrow">ORGANIZAÇÃO</span><h2>Categorias</h2>
        <form onSubmit={addCategory} className="inline-form"><input placeholder="Ex.: Camisetas, Lanches, Manutenção..." value={categoryName} onChange={e=>setCategoryName(e.target.value)} /><button className="primary-button" disabled={savingItem}>Adicionar</button></form>
        <div className="item-list">{categories.length===0 ? <p className="muted">Nenhuma categoria cadastrada.</p> : categories.map(item=><div className="catalog-item" key={item.id}><span>{item.name}</span><button className="danger-button" onClick={()=>deleteCategory(item.id)}>Excluir</button></div>)}</div>
      </article>}
      {tab === 'products' && <div className="products-manager">
        <article className="panel"><span className="eyebrow">CATÁLOGO</span><h2>{editingProduct ? 'Editar produto ou serviço' : 'Novo produto ou serviço'}</h2>
          <form onSubmit={addProduct} className="auth-form">
            <label>Nome<input value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})} placeholder="Nome do produto ou serviço" /></label>
            <label>Descrição<textarea value={productForm.description} onChange={e=>setProductForm({...productForm,description:e.target.value})} maxLength={500} placeholder="Descrição curta" /></label>
            <div className="form-two"><label>Preço<input type="number" min="0" step="0.01" value={productForm.price} onChange={e=>setProductForm({...productForm,price:e.target.value})} placeholder="0,00" /></label><label>Estoque<input type="number" min="0" step="1" value={productForm.stock} onChange={e=>setProductForm({...productForm,stock:e.target.value})} placeholder="Opcional" /></label></div>
            <label>Categoria<select value={productForm.category_id} onChange={e=>setProductForm({...productForm,category_id:e.target.value})}><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Status<select value={productForm.status} onChange={e=>setProductForm({...productForm,status:e.target.value})}><option value="active">Ativo</option><option value="inactive">Inativo</option><option value="out_of_stock">Sem estoque</option></select></label>
            <div className="product-edit-actions">
              <button className="primary-button" disabled={savingItem}>{savingItem ? 'Salvando...' : editingProduct ? 'Salvar alterações' : 'Adicionar ao catálogo'}</button>
              {editingProduct && <button type="button" className="secondary-button" onClick={cancelEdit}>Cancelar edição</button>}
            </div>
            {editingProduct && <div className="image-manager">
              <div className="image-manager-title"><strong>Fotos do produto</strong><span>JPG, PNG ou WEBP · até 5 MB</span></div>
              <div className="image-grid">
                {(editingProduct.product_images || []).map(image => <div className="image-thumb" key={image.id}><img src={image.image_url} alt="" /><button type="button" onClick={()=>deleteProductImage(image)}>Excluir</button></div>)}
                {(editingProduct.product_images || []).length === 0 && <div className="image-empty">Nenhuma foto adicionada.</div>}
              </div>
              <div className="image-upload-row"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setProductImage(e.target.files?.[0] || null)} /><button type="button" className="secondary-button" disabled={!productImage || uploadingImage} onClick={uploadProductImage}>{uploadingImage ? 'Enviando...' : 'Enviar foto'}</button></div>
            </div>}
          </form>
        </article>
        <article className="panel"><span className="eyebrow">CADASTRADOS</span><h2>{products.length} item(ns)</h2><div className="item-list">{products.length===0?<p className="muted">Nenhum produto ou serviço cadastrado.</p>:products.map(item=><div className="catalog-item product-row" key={item.id}><div><strong>{item.name}</strong><span>{item.price != null ? `R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : 'Preço não informado'} · {item.status==='active'?'Ativo':item.status==='inactive'?'Inativo':'Sem estoque'}</span></div><div className="row-actions"><button className="secondary-button" onClick={()=>editProduct(item)}>Editar</button><button className="danger-button" onClick={()=>deleteProduct(item.id)}>Excluir</button></div></div>)}</div></article>
      {tab === 'customize' && <article className="panel customization-panel">
        <span className="eyebrow">IDENTIDADE</span><h2>Personalizar catálogo</h2>
        <form onSubmit={saveCatalogSettings} className="auth-form">
          <label>Nome da empresa<input value={settings.company_name} onChange={e=>setSettings({...settings,company_name:e.target.value})} /></label>
          <label>Descrição<textarea value={settings.description} onChange={e=>setSettings({...settings,description:e.target.value})} maxLength={500} placeholder="Apresente sua empresa..." /></label>
          <div className="form-two"><label>WhatsApp<input value={settings.whatsapp} onChange={e=>setSettings({...settings,whatsapp:e.target.value})} placeholder="5511999999999" /></label><label>Horário de atendimento<input value={settings.hours} onChange={e=>setSettings({...settings,hours:e.target.value})} placeholder="Seg a Sex · 9h às 18h" /></label></div>
          <label>Endereço<input value={settings.address} onChange={e=>setSettings({...settings,address:e.target.value})} placeholder="Rua, número, bairro, cidade - UF" /></label>
          <div className="form-two"><label>Instagram<input value={settings.instagram_url} onChange={e=>setSettings({...settings,instagram_url:e.target.value})} placeholder="https://instagram.com/..." /></label><label>Facebook<input value={settings.facebook_url} onChange={e=>setSettings({...settings,facebook_url:e.target.value})} placeholder="https://facebook.com/..." /></label></div>
          <label>Tema<select value={settings.theme} onChange={e=>setSettings({...settings,theme:e.target.value})}><option>Minimalista</option><option>Moderno</option><option>Elegante</option><option>Colorido</option></select></label>
          <div className="color-grid">
            <label>Primária<input type="color" value={settings.primary_color} onChange={e=>setSettings({...settings,primary_color:e.target.value})} /></label>
            <label>Secundária<input type="color" value={settings.secondary_color} onChange={e=>setSettings({...settings,secondary_color:e.target.value})} /></label>
            <label>Fundo<input type="color" value={settings.background_color} onChange={e=>setSettings({...settings,background_color:e.target.value})} /></label>
            <label>Botões<input type="color" value={settings.button_color} onChange={e=>setSettings({...settings,button_color:e.target.value})} /></label>
          </div>
          {message && <div className="form-message success">{message}</div>}
          <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar personalização'}</button>
        </form>
      </article>}
      </div>}
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