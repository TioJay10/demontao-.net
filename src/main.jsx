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
  const [orders, setOrders] = useState([]);
  const [categoryName, setCategoryName] = useState('');
  const emptyProductForm = { name: '', description: '', price: '', stock: '', category_id: '', status: 'active' };
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productImage, setProductImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [brandUploading, setBrandUploading] = useState('');
  const [settings, setSettings] = useState({ company_name: catalog?.company_name || '', business_category: catalog?.business_category || 'Outros', description: catalog?.description || '', whatsapp: catalog?.whatsapp || '', address: catalog?.address || '', hours: catalog?.hours || '', instagram_url: catalog?.instagram_url || '', facebook_url: catalog?.facebook_url || '', primary_color: catalog?.primary_color || '#111827', secondary_color: catalog?.secondary_color || '#6b7280', background_color: catalog?.background_color || '#f7f7f5', button_color: catalog?.button_color || '#111827', theme: catalog?.theme || 'minimalist', logo_url: catalog?.logo_url || '', cover_url: catalog?.cover_url || '' });
  const [savingItem, setSavingItem] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState(null);

  useEffect(() => {
    if (!catalog?.id || !supabase) return;
    Promise.all([
      supabase.from('categories').select('*').eq('catalog_id', catalog.id).order('sort_order').order('created_at'),
      supabase.from('products').select('*, product_images(*)').eq('catalog_id', catalog.id).order('created_at', { ascending: false }),
      supabase.from('orders').select('*, order_items(*)').eq('catalog_id', catalog.id).order('created_at', { ascending: false })
     ]).then(([cats, prods, ords]) => {
      if (cats.error) setCatalogError(cats.error.message); else setCategories(cats.data || []);
      if (prods.error) setCatalogError(prods.error.message); else setProducts(prods.data || []);
      if (ords?.error) setCatalogError(ords.error.message); else setOrders(ords?.data || []);
    });
  }, [catalog?.id]);

  const updateOrderStatus = async (id, status) => {
    const { data, error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) return setCatalogError(error.message);
    setOrders(orders.map(order => order.id === id ? { ...order, ...data } : order));
    if (status === 'confirmed') setReceiptOrder({ ...orders.find(order => order.id === id), ...data });
  };

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

  const addProduct = async (event) => {
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
      const path = `${user.id}/products/${editingProduct.id}/${crypto.randomUUID()}.${ext}`;
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

  const uploadBrandImage = async (type, file) => {
    if (!file || !currentCatalog?.id) return;
    setBrandUploading(type); setCatalogError('');
    try {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use JPG, PNG ou WEBP.');
      if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = user.id + '/brand/' + type + '-' + crypto.randomUUID() + '.' + ext;
      const { error: uploadError } = await supabase.storage.from('catalog-images').upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('catalog-images').getPublicUrl(path);
      const field = type === 'logo' ? 'logo_url' : 'cover_url';
      const { data: updated, error } = await supabase.from('catalogs').update({ [field]: data.publicUrl, updated_at: new Date().toISOString() }).eq('id', currentCatalog.id).select('*').single();
      if (error) throw error;
      setCurrentCatalog(updated); setSettings(prev => ({...prev, ...updated}));
    } catch (error) { setCatalogError(error.message || 'Não foi possível enviar a imagem.'); }
    finally { setBrandUploading(''); }
  };

  const removeBrandImage = async (type) => {
    const field = type === 'logo' ? 'logo_url' : 'cover_url';
    const url = currentCatalog?.[field];
    if (!url) return;
    setBrandUploading(type); setCatalogError('');
    try {
      const marker = '/catalog-images/';
      const idx = url.indexOf(marker);
      if (idx >= 0) await supabase.storage.from('catalog-images').remove([url.slice(idx + marker.length).split('?')[0]]);
      const { data, error } = await supabase.from('catalogs').update({ [field]: null, updated_at: new Date().toISOString() }).eq('id', currentCatalog.id).select('*').single();
      if (error) throw error;
      setCurrentCatalog(data); setSettings(prev => ({...prev, ...data}));
    } catch (error) { setCatalogError(error.message || 'Não foi possível remover a imagem.'); }
    finally { setBrandUploading(''); }
  };

  const saveCatalogSettings = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    const payload = {
      business_category: settings.business_category || 'Outros',
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

  const setupItems = [
    { label: 'Defina a categoria do negócio', done: !!currentCatalog.business_category },
    { label: 'Adicione uma categoria de produtos ou serviços', done: categories.length > 0 },
    { label: 'Cadastre seu primeiro produto ou serviço', done: products.length > 0 },
    { label: 'Adicione logo, capa ou contatos', done: !!(currentCatalog.logo_url || currentCatalog.cover_url || currentCatalog.whatsapp || currentCatalog.instagram_url || currentCatalog.facebook_url) }
  ];
  const setupDone = setupItems.filter(item => item.done).length;

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
        <button className={tab==='orders'?'nav-item active':'nav-item'} onClick={()=>setTab('orders')}>Pedidos {orders.length ? `(${orders.length})` : ''}</button>
        <button className={tab==='customize'?'nav-item active':'nav-item'} onClick={()=>setTab('customize')}>Personalizar catálogo</button>
      </nav>
      <div className="dashboard-intro"><span className="eyebrow">OLÁ</span><h1>{currentCatalog.company_name || 'Meu catálogo'}</h1><p>Seu painel para organizar o catálogo digital.</p></div>
      <div className="share-catalog-card">
        <div><span className="eyebrow">DIVULGAÇÃO</span><h2>Compartilhe seu catálogo</h2><p>Use o QR Code para seus clientes acessarem seu catálogo pelo celular.</p></div>
        <div className="share-actions"><button className="primary-button" onClick={()=>setShareOpen(true)}>Compartilhar catálogo</button><button className="secondary-button" onClick={()=>navigator.clipboard?.writeText(window.location.origin+'/'+currentCatalog.slug)}>Copiar link</button></div>
      {shareOpen && <div className="modal-backdrop" onClick={()=>setShareOpen(false)}><section className="share-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShareOpen(false)}>×</button><span className="eyebrow">DIVULGAÇÃO</span><h2>Compartilhe seu catálogo</h2><p className="muted">Envie o catálogo para seus clientes ou mostre o QR Code.</p><div className="share-link-box">{window.location.origin+'/'+currentCatalog.slug}</div><div className="share-options"><button className="share-option" onClick={()=>{navigator.clipboard?.writeText(window.location.origin+'/'+currentCatalog.slug);setShareOpen(false)}}><b>🔗</b><span>Copiar link</span></button><a className="share-option" href={'https://wa.me/?text='+encodeURIComponent('Confira nosso catálogo: '+window.location.origin+'/'+currentCatalog.slug)} target="_blank" rel="noreferrer"><b>💬</b><span>WhatsApp</span></a><button className="share-option" onClick={()=>{setShareOpen(false);setQrOpen(true)}}><b>▦</b><span>QR Code</span></button><button className="share-option" onClick={async()=>{if(navigator.share) await navigator.share({title:currentCatalog.company_name,url:window.location.origin+'/'+currentCatalog.slug}); else navigator.clipboard?.writeText(window.location.origin+'/'+currentCatalog.slug)}}><b>↗</b><span>Mais opções</span></button></div></section></div>}
      </div>
      {qrOpen && <div className="modal-backdrop" onClick={()=>setQrOpen(false)}><section className="qr-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setQrOpen(false)}>×</button><span className="eyebrow">SEU CATÁLOGO</span><h2>QR Code</h2><p>Aponte a câmera do celular para acessar <strong>{currentCatalog.company_name}</strong>.</p><div className="qr-frame"><img src={'https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data='+encodeURIComponent(window.location.origin+'/'+currentCatalog.slug)} alt="QR Code do catálogo" /></div><div className="qr-url">{window.location.origin+'/'+currentCatalog.slug}</div><div className="share-actions"><a className="primary-button qr-download" href={'https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=20&data='+encodeURIComponent(window.location.origin+'/'+currentCatalog.slug)} target="_blank" rel="noreferrer">Abrir QR Code</a><button className="secondary-button" onClick={()=>navigator.clipboard?.writeText(window.location.origin+'/'+currentCatalog.slug)}>Copiar link</button></div></section></div>}
      <div className="status-card"><div><strong>Status do catálogo</strong><span>{currentCatalog.is_active ? 'Ativo' : 'Aguardando ativação do plano'}</span></div><span className={currentCatalog.is_active ? 'status-dot active' : 'status-dot'}></span></div>
      {catalogError && <div className="form-message">{catalogError}</div>}
      {tab === 'overview' && <>
        <div className="dashboard-metrics">
          <button type="button" className="metric-card" onClick={()=>setTab('categories')}><span>Categorias</span><strong>{categories.length}</strong><small>Organização do catálogo</small></button>
          <button type="button" className="metric-card" onClick={()=>setTab('products')}><span>Produtos e serviços</span><strong>{products.length}</strong><small>Itens cadastrados</small></button>
          <button type="button" className="metric-card" onClick={()=>setTab('orders')}><span>Pedidos</span><strong>{orders.length}</strong><small>Pedidos recebidos</small></button>
          <div className="metric-card metric-status"><span>Status do catálogo</span><strong>{currentCatalog.is_active ? 'Ativo' : 'Inativo'}</strong><small>{currentCatalog.is_active ? 'Seu catálogo está público' : 'Aguardando ativação do plano'}</small></div>
        </div>
        <div className="dashboard-grid">
        <article className="panel"><span className="eyebrow">CATÁLOGO</span><h2>Dados da empresa</h2><form onSubmit={save} className="auth-form">
          <label>Nome da empresa<input value={companyName} onChange={e=>setCompanyName(e.target.value)} /></label>
          {message && <div className="form-message success">{message}</div>}
          <button className="primary-button" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
        </form></article>
        <article className="panel setup-panel"><span className="eyebrow">CONFIGURAÇÃO</span><div className="setup-heading"><div><h2>Prepare seu catálogo</h2><p>{setupDone === setupItems.length ? 'Tudo pronto para divulgar.' : 'Complete os passos principais para deixar sua página pronta.'}</p></div><strong>{setupDone}/{setupItems.length}</strong></div><div className="setup-progress"><span style={{width: ((setupDone / setupItems.length) * 100) + '%'}}></span></div><div className="setup-list">{setupItems.map((item,index)=><div className={item.done ? 'setup-item done' : 'setup-item'} key={item.label}><b>{item.done ? '✓' : String(index + 1).padStart(2,'0')}</b><span>{item.label}</span></div>)}</div></article>
      </div></>}
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
      </div>}
      {tab === 'orders' && <article className="panel orders-panel">
        <span className="eyebrow">VENDAS</span><h2>Pedidos recebidos</h2>
        {catalogError && <div className="form-message">{catalogError}</div>}
        {orders.length === 0 ? <p className="muted">Nenhum pedido recebido ainda.</p> : <div className="orders-list">
          {orders.map(order => <div className="order-card" key={order.id}>
            <div className="order-head"><div><strong>Pedido #{order.id.slice(0,8)}</strong><span>{new Date(order.created_at).toLocaleString('pt-BR')}</span></div><strong>R$ {Number(order.total || 0).toFixed(2).replace('.', ',')}</strong></div>
            <div className="order-customer"><strong>{order.customer_name}</strong><span>{order.customer_phone}</span>{order.customer_address && <span>{order.customer_address}</span>}</div>
            <div className="order-items">{(order.order_items || []).map((item, i) => <div key={i}><span>{item.quantity}× {item.product_name}</span><strong>R$ {(Number(item.unit_price||0)*item.quantity).toFixed(2).replace('.', ',')}</strong></div>)}</div>
            {order.notes && <p className="order-notes"><strong>Obs.:</strong> {order.notes}</p>}
            <div className="order-actions"><select value={order.status} onChange={e=>updateOrderStatus(order.id,e.target.value)}><option value="new">Novo</option><option value="in_analysis">Em análise</option><option value="confirmed">Confirmado</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select>{order.status === 'confirmed' && <button className="secondary-button" onClick={()=>setReceiptOrder(order)}>Ver comprovante</button>}</div>
          </div>)}
        </div>}
      </article>}
      {tab === 'customize' && <article className="panel customization-panel">
        <span className="eyebrow">IDENTIDADE</span><h2>Personalizar catálogo</h2>
        <form onSubmit={saveCatalogSettings} className="auth-form">
          <label>Categoria do negócio<select value={settings.business_category} onChange={e=>setSettings({...settings,business_category:e.target.value})}><option>Alimentação</option><option>Moda</option><option>Beleza</option><option>Casa</option><option>Serviços</option><option>Eventos</option><option>Tecnologia</option><option>Saúde</option><option>Educação</option><option>Automotivo</option><option>Outros</option></select></label>
          <label>Nome da empresa<input value={settings.company_name} onChange={e=>setSettings({...settings,company_name:e.target.value})} /></label>
          <label>Descrição<textarea value={settings.description} onChange={e=>setSettings({...settings,description:e.target.value})} maxLength={500} placeholder="Apresente sua empresa..." /></label>
          <div className="brand-media-manager">
            <div className="brand-media-card"><strong>Logo</strong>{settings.logo_url ? <img className="brand-preview logo-preview" src={settings.logo_url} alt="Logo da empresa" /> : <div className="brand-empty">Nenhuma logo</div>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>uploadBrandImage('logo', e.target.files?.[0])} disabled={!!brandUploading}/>{settings.logo_url && <button type="button" className="danger-button" onClick={()=>removeBrandImage('logo')} disabled={!!brandUploading}>{brandUploading==='logo'?'Removendo...':'Remover logo'}</button>}</div>
            <div className="brand-media-card"><strong>Capa</strong>{settings.cover_url ? <img className="brand-preview cover-preview" src={settings.cover_url} alt="Capa da empresa" /> : <div className="brand-empty">Nenhuma capa</div>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>uploadBrandImage('cover', e.target.files?.[0])} disabled={!!brandUploading}/>{settings.cover_url && <button type="button" className="danger-button" onClick={()=>removeBrandImage('cover')} disabled={!!brandUploading}>{brandUploading==='cover'?'Removendo...':'Remover capa'}</button>}</div>
          </div>
          <div className="form-two"><label>WhatsApp<input value={settings.whatsapp} onChange={e=>setSettings({...settings,whatsapp:e.target.value})} placeholder="5511999999999" /></label><label>Horário de atendimento<input value={settings.hours} onChange={e=>setSettings({...settings,hours:e.target.value})} placeholder="Seg a Sex · 9h às 18h" /></label></div>
          <label>Endereço<input value={settings.address} onChange={e=>setSettings({...settings,address:e.target.value})} placeholder="Rua, número, bairro, cidade - UF" /></label>
          <div className="form-two"><label>Instagram<input value={settings.instagram_url} onChange={e=>setSettings({...settings,instagram_url:e.target.value})} placeholder="https://instagram.com/..." /></label><label>Facebook<input value={settings.facebook_url} onChange={e=>setSettings({...settings,facebook_url:e.target.value})} placeholder="https://facebook.com/..." /></label></div>
          <label>Tema<select value={settings.theme} onChange={e=>setSettings({...settings,theme:e.target.value})}><option value="minimalist">Minimalista</option><option value="modern">Moderno</option><option value="elegant">Elegante</option><option value="colorful">Colorido</option></select></label>
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
    {receiptOrder && <div className="modal-backdrop" onClick={()=>setReceiptOrder(null)}><section className="receipt-modal" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={()=>setReceiptOrder(null)}>×</button>
        <div className="receipt" id="receipt">
          {currentCatalog.logo_url && <img className="receipt-logo" src={currentCatalog.logo_url} alt="" />}
          <div className="receipt-brand">{currentCatalog.company_name || 'DEMONTAO.NET'}</div>
          <span className="eyebrow">COMPROVANTE DE PEDIDO</span>
          <h2>Pedido #{receiptOrder.id.slice(0,8)}</h2>
          <p className="receipt-date">{new Date(receiptOrder.created_at).toLocaleString('pt-BR')}</p>
          <div className="receipt-section"><strong>Cliente</strong><span>{receiptOrder.customer_name}</span><span>{receiptOrder.customer_phone}</span>{receiptOrder.customer_address && <span>{receiptOrder.customer_address}</span>}</div>
          <div className="receipt-items">{(receiptOrder.order_items || []).map((item,i)=><div key={i}><span>{item.quantity}× {item.product_name}</span><strong>R$ {(Number(item.unit_price||0)*item.quantity).toFixed(2).replace('.', ',')}</strong></div>)}</div>
          <div className="receipt-total"><span>Total</span><strong>R$ {Number(receiptOrder.total||0).toFixed(2).replace('.', ',')}</strong></div>
          <div className="receipt-section"><strong>Pagamento</strong><span>{receiptOrder.payment_method || 'A combinar'}</span>{receiptOrder.notes && <><strong>Observações</strong><span>{receiptOrder.notes}</span></>}</div>
          {currentCatalog.address && <p className="receipt-footer">{currentCatalog.address}</p>}
        </div>
        <div className="share-actions receipt-actions"><button className="primary-button" onClick={()=>window.print()}>Imprimir / Salvar PDF</button><button className="secondary-button" onClick={()=>setReceiptOrder(null)}>Fechar</button></div>
      </section></div>}</section>
  </main>;
}

function PublicCatalog({ slug }) {
  const [catalog, setCatalog] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkout, setCheckout] = useState({ customer_name:'', phone:'', address:'', notes:'', payment_method:'A combinar' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true); setMessage('');
      const { data: c, error: ce } = await supabase.from('catalogs').select('*').eq('slug', slug).eq('is_active', true).maybeSingle();
      if (ce || !c) { setMessage('Catálogo não encontrado ou ainda não está ativo.'); setLoading(false); return; }
      const [cats, prods] = await Promise.all([
        supabase.from('categories').select('*').eq('catalog_id', c.id).eq('is_active', true).order('sort_order').order('created_at'),
        supabase.from('products').select('*, product_images(*)').eq('catalog_id', c.id).eq('status','active').order('created_at', {ascending:false})
      ]);
      if (cats.error || prods.error) setMessage(cats.error?.message || prods.error?.message || 'Não foi possível carregar o catálogo.');
      setCatalog(c); setCategories(cats.data || []); setProducts(prods.data || []); setLoading(false);
    };
    load();
  }, [slug]);

  const filtered = products.filter(p => {
    const matchesCategory = activeCategory === 'all' || p.category_id === activeCategory;
    const text = query.trim().toLowerCase();
    return matchesCategory && (!text || p.name.toLowerCase().includes(text) || (p.description || '').toLowerCase().includes(text));
  });
  const addToCart = (product) => {
    setCart(items => {
      const found = items.find(i => i.product.id === product.id);
      if (found) return items.map(i => i.product.id === product.id ? {...i, quantity:i.quantity+1} : i);
      return [...items, {product, quantity:1}];
    });
    setSelectedProduct(null);
  };
  const changeQty = (id, delta) => setCart(items => items.map(i => i.product.id === id ? {...i, quantity:Math.max(0,i.quantity+delta)} : i).filter(i=>i.quantity>0));
  const total = cart.reduce((sum,i) => sum + (Number(i.product.price)||0)*i.quantity, 0);
  const money = value => value == null ? 'Consultar' : 'R$ ' + Number(value).toFixed(2).replace('.', ',');
  const publicImage = p => p.product_images?.[0]?.image_url || '';

  const submitOrder = async (event) => {
    event.preventDefault();
    if (!cart.length || !checkout.customer_name.trim() || !checkout.phone.trim()) return setMessage('Informe nome e telefone para enviar o pedido.');
    setMessage('');
    const { data: order, error } = await supabase.from('orders').insert({
      catalog_id: catalog.id, customer_name: checkout.customer_name.trim(), customer_phone: checkout.phone.trim(),
      customer_address: checkout.address.trim() || null, notes: checkout.notes.trim() || null,
      payment_method: checkout.payment_method, status:'new', total: total
    }).select('*').single();
    if (error) return setMessage(error.message);
    const items = cart.map(i => ({order_id:order.id, product_id:i.product.id, product_name:i.product.name, quantity:i.quantity, unit_price:Number(i.product.price)||0}));
    const { error: itemError } = await supabase.from('order_items').insert(items);
    if (itemError) { await supabase.from('orders').delete().eq('id', order.id); return setMessage(itemError.message); }
    const lines = cart.map(i => '• ' + i.product.name + ' x' + i.quantity + ' — ' + money((Number(i.product.price)||0)*i.quantity)).join('\n');
    const text = 'Olá, ' + catalog.company_name + '!\n\nNovo pedido #' + order.id.slice(0,8) + '\n' + lines + '\n\nTotal: ' + money(total) + '\nCliente: ' + checkout.customer_name + '\nTelefone: ' + checkout.phone + (checkout.address ? '\nEndereço: ' + checkout.address : '') + (checkout.notes ? '\nObservações: ' + checkout.notes : '') + '\nPagamento: ' + checkout.payment_method;
    const phone = (catalog.whatsapp || '').replace(/\D/g,'');
    if (phone) window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
    setCart([]); setCheckoutOpen(false); setCheckout({customer_name:'',phone:'',address:'',notes:'',payment_method:'A combinar'}); setMessage('Pedido #' + order.id.slice(0,8) + ' criado com sucesso.');
  };

  if (loading) return <div className="loading-screen">DEMONTAO.NET</div>;
  if (!catalog) return <main className="public-error"><div><div className="brand">DEMONTAO.NET</div><h1>{message}</h1><a href="/">Voltar ao início</a></div></main>;
  const themeStyle = { '--catalog-primary': catalog.primary_color || '#111827', '--catalog-secondary': catalog.secondary_color || '#6b7280', '--catalog-bg': catalog.background_color || '#f7f7f5', '--catalog-button': catalog.button_color || '#111827' };

  return <main className="public-catalog" style={themeStyle}>
    <header className="public-header">
      <div className="public-brand-area">{catalog.logo_url ? <img className="catalog-logo" src={catalog.logo_url} alt="" /> : null}<div><h1>{catalog.company_name}</h1><p>{catalog.description}</p></div></div>
      <div className="public-header-actions">
        {catalog.whatsapp && <a className="catalog-whatsapp" href={'https://wa.me/' + catalog.whatsapp.replace(/\D/g,'')} target="_blank" rel="noreferrer">WhatsApp</a>}
        <button className="cart-button" onClick={()=>setCheckoutOpen(true)}>Carrinho <span>{cart.reduce((n,i)=>n+i.quantity,0)}</span></button>
      </div>
    </header>
    {catalog.cover_url && <div className="catalog-cover"><img src={catalog.cover_url} alt="" /></div>}
    <section className="public-content">
      <div className="public-info">{catalog.address && <span>📍 {catalog.address}</span>}{catalog.hours && <span>🕒 {catalog.hours}</span>}{catalog.whatsapp && <a href={'https://wa.me/' + catalog.whatsapp.replace(/\D/g,'')} target="_blank" rel="noreferrer">WhatsApp</a>}</div>
      <div className="public-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar produtos ou serviços..." /></div>
      <div className="public-categories"><button className={activeCategory==='all'?'category active':'category'} onClick={()=>setActiveCategory('all')}>Todos</button>{categories.map(c=><button key={c.id} className={activeCategory===c.id?'category active':'category'} onClick={()=>setActiveCategory(c.id)}>{c.name}</button>)}</div>
      {message && <div className="public-message">{message}</div>}
      <div className="product-grid">{filtered.map(p=><article className="public-product" key={p.id} onClick={()=>setSelectedProduct(p)}>
        <div className="public-product-image">{publicImage(p) ? <img src={publicImage(p)} alt="" /> : <span>Sem foto</span>}</div>
        <div className="public-product-body"><span className="product-category">{categories.find(c=>c.id===p.category_id)?.name || 'Produto'}</span><h2>{p.name}</h2><p>{p.description}</p><div className="product-card-footer"><strong>{money(p.price)}</strong><button type="button" className="product-add-button" onClick={e=>{e.stopPropagation();addToCart(p)}}>Adicionar</button></div></div>
      </article>)}</div>
      {!filtered.length && <div className="public-empty"><h2>Nenhum item encontrado</h2><p>Tente outra busca ou categoria.</p></div>}
    </section>
    {(catalog.instagram_url || catalog.facebook_url || catalog.whatsapp) && <footer className="public-footer">
      <div>
        <strong>{catalog.company_name}</strong>
        <span>Catálogo digital no DEMONTAO.NET</span>
      </div>
      <div className="public-footer-links">
        {catalog.whatsapp && <a href={'https://wa.me/' + catalog.whatsapp.replace(/\D/g,'')} target="_blank" rel="noreferrer">WhatsApp</a>}
        {catalog.instagram_url && <a href={catalog.instagram_url} target="_blank" rel="noreferrer">Instagram</a>}
        {catalog.facebook_url && <a href={catalog.facebook_url} target="_blank" rel="noreferrer">Facebook</a>}
      </div>
    </footer>}
    {selectedProduct && <div className="modal-backdrop" onClick={()=>setSelectedProduct(null)}><section className="product-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelectedProduct(null)}>×</button><div className="modal-image">{publicImage(selectedProduct) ? <img src={publicImage(selectedProduct)} alt="" /> : <span>Sem foto</span>}</div><div className="modal-body"><span className="product-category">{categories.find(c=>c.id===selectedProduct.category_id)?.name || 'Produto'}</span><h2>{selectedProduct.name}</h2><p>{selectedProduct.description}</p><strong>{money(selectedProduct.price)}</strong><button className="primary-button" onClick={()=>addToCart(selectedProduct)}>Adicionar ao carrinho</button></div></section></div>}
    {checkoutOpen && <div className="modal-backdrop" onClick={()=>setCheckoutOpen(false)}><section className="checkout-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setCheckoutOpen(false)}>×</button><span className="eyebrow">PEDIDO</span><h2>Seu carrinho</h2><div className="cart-list">{cart.map(i=><div className="cart-item" key={i.product.id}><div><strong>{i.product.name}</strong><span>{money(i.product.price)} cada</span></div><div className="qty"><button onClick={()=>changeQty(i.product.id,-1)}>−</button><b>{i.quantity}</b><button onClick={()=>changeQty(i.product.id,1)}>+</button></div></div>)}</div>{!cart.length ? <p className="muted">Seu carrinho está vazio.</p> : <><div className="cart-total"><span>Total</span><strong>{money(total)}</strong></div><form className="auth-form" onSubmit={submitOrder}><label>Nome<input required value={checkout.customer_name} onChange={e=>setCheckout({...checkout,customer_name:e.target.value})} /></label><label>Telefone / WhatsApp<input required value={checkout.phone} onChange={e=>setCheckout({...checkout,phone:e.target.value})} /></label><label>Endereço<textarea value={checkout.address} onChange={e=>setCheckout({...checkout,address:e.target.value})} placeholder="Opcional" /></label><label>Observações<textarea value={checkout.notes} onChange={e=>setCheckout({...checkout,notes:e.target.value})} placeholder="Opcional" /></label><label>Forma de pagamento<select value={checkout.payment_method} onChange={e=>setCheckout({...checkout,payment_method:e.target.value})}><option>A combinar</option><option>Pix</option><option>Dinheiro</option><option>Cartão</option></select></label>{message && <div className="form-message">{message}</div>}<button className="primary-button">Enviar pedido pelo WhatsApp</button></form></>}</section></div>}
  </main>;
}

function HomePage({ onLogin }) {
  const [catalogs, setCatalogs] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoadError('');
      const [{ data: catalogData, error: catalogError }, { data: productData, error: productError }] = await Promise.all([
        supabase.from('catalogs').select('id,slug,company_name,description,logo_url,address,business_category,is_active,created_at').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('products').select('id,catalog_id,name,description,status').eq('status', 'active')
      ]);
      if (catalogError || productError) setLoadError(catalogError?.message || productError?.message || 'Não foi possível carregar os catálogos.');
      setCatalogs(catalogData || []);
      setProducts(productData || []);
      setLoading(false);
    };
    load();
  }, []);

  const q = query.trim().toLowerCase();

  const matchingProductsByCatalog = new Map();
  if (q) {
    products.forEach(p => {
      const matches = (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
      if (matches) {
        const current = matchingProductsByCatalog.get(p.catalog_id) || [];
        if (current.length < 2) current.push(p);
        matchingProductsByCatalog.set(p.catalog_id, current);
      }
    });
  }

  const categories = ['all','Alimentação','Moda','Beleza','Casa','Serviços','Eventos','Tecnologia','Saúde','Educação','Automotivo','Outros'];
  const showRecent = !q && category === 'all';
  const recentCatalogs = showRecent ? catalogs.slice(0, 3) : [];
  const recentIds = new Set(recentCatalogs.map(c => c.id));

  const filtered = catalogs.filter(c => {
    if (showRecent && recentIds.has(c.id)) return false;
    return (category === 'all' || c.business_category === category) && (!q ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      matchingProductsByCatalog.has(c.id));
  });
  const categoryCounts = categories.slice(1).reduce((acc, item) => {
    acc[item] = catalogs.filter(c => c.business_category === item).length;
    return acc;
  }, {});

  const renderCatalogCard = (c) => (
    <a className="catalog-card" key={c.id} href={'/' + c.slug}>
      <div className="catalog-card-logo">
        {c.logo_url ? <img src={c.logo_url} alt="" /> : <span>{c.company_name?.charAt(0).toUpperCase()}</span>}
      </div>
      <div className="catalog-card-body">
        {c.business_category && <span className="catalog-card-category">{c.business_category}</span>}
        <h3>{c.company_name}</h3>
        <p>{c.description || 'Confira produtos e serviços.'}</p>
        {c.address && <small>{c.address}</small>}
        {q && matchingProductsByCatalog.get(c.id)?.length > 0 && (
          <div className="catalog-card-matches">
            <span>Encontrado:</span>
            {matchingProductsByCatalog.get(c.id).map(p => <b key={p.id}>{p.name}</b>)}
          </div>
        )}
        <span className="catalog-card-link">Ver catálogo <b>→</b></span>
      </div>
    </a>
  );

  return <main className="app">
    <header className="topbar">
      <div className="brand">DEMONTAO.NET</div>
      <button className="login" onClick={onLogin}>Entrar</button>
    </header>

    <section className="home-hero">
      <div>
        <span className="eyebrow">CATÁLOGOS DIGITAIS</span>
        <h1>Encontre o que você procura.</h1>
        <p>Explore empresas, produtos e serviços em um só lugar.</p>
        <div className="home-search">
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar empresa, produto ou serviço..." />
        </div>
      </div>
      <div className="home-hero-card">
        <strong>DEMONTAO.NET</strong>
        <span>Seu catálogo. Seu negócio. Seu cliente.</span>
      </div>
    </section>

    <section className="content home-content">
      <div className="home-discovery-heading">
        <div>
          <span className="eyebrow">EXPLORAR</span>
          <h2>Encontre por categoria</h2>
        </div>
        {!loading && <span className="catalog-count">{catalogs.length} {catalogs.length === 1 ? 'catálogo ativo' : 'catálogos ativos'}</span>}
      </div>

      <div className="home-category-filter">
        {categories.map(item => (
          <button key={item} type="button" className={category === item ? 'active' : ''} onClick={()=>setCategory(item)}>
            {item === 'all' ? 'Todos' : item}
            {item !== 'all' && categoryCounts[item] > 0 ? <small>{categoryCounts[item]}</small> : null}
          </button>
        ))}
      </div>

      {loading ? <div className="empty-state"><h3>Carregando catálogos...</h3></div> : loadError ? <div className="empty-state"><h3>Não foi possível carregar os catálogos.</h3><p>{loadError}</p></div> : <>
        {showRecent && recentCatalogs.length > 0 && (
          <section className="home-subsection">
            <div className="home-subsection-heading">
              <div>
                <span className="eyebrow">NOVOS NA PLATAFORMA</span>
                <h2>Catálogos recentes</h2>
              </div>
              <span>Atualizados primeiro</span>
            </div>
            <div className="recent-catalog-grid">{recentCatalogs.map(renderCatalogCard)}</div>
          </section>
        )}

        <section className="home-subsection">
          <div className="home-subsection-heading">
            <div>
              <span className="eyebrow">{q ? 'BUSCA' : 'CATÁLOGOS'}</span>
              <h2>{q ? 'Resultados da busca' : category !== 'all' ? category : 'Todos os catálogos'}</h2>
            </div>
            <span>{filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}</span>
          </div>

          {filtered.length ? (
            <div className="catalog-grid">{filtered.map(renderCatalogCard)}</div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">⌕</div>
              <h3>Nenhum resultado encontrado</h3>
              <p>Tente outro nome, produto, serviço ou localização.</p>
            </div>
          )}
        </section>
      </>}
    </section>
  </main>;
}
function App() {
  const [view, setView] = useState(window.location.pathname !== '/' ? 'public' : 'home');
  const [publicSlug] = useState(window.location.pathname !== '/' ? window.location.pathname.split('/').filter(Boolean)[0] : '');
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
  if (view === 'public') return <PublicCatalog slug={publicSlug} />;
  if (view === 'dashboard' && user && catalog) return <OwnerDashboard user={user} catalog={catalog} onLogout={async()=>{await supabase.auth.signOut(); setUser(null); setCatalog(null); setView('home')}} />;

  return <HomePage onLogin={()=>{setAuthMode('login');setView('auth')}} />;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);