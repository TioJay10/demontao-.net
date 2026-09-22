import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const categories = ['Todos', 'Moda', 'Alimentação', 'Serviços', 'Casa', 'Beleza'];

function App() {
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">DEMONTAO.NET</div>
        <button className="login">Entrar</button>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">CATÁLOGO DIGITAL</span>
          <h1>Encontre produtos e serviços.</h1>
          <p>Explore catálogos de empresas, escolha o que precisa e faça seu pedido de forma simples.</p>
        </div>
        <div className="hero-card" aria-hidden="true">
          <div className="hero-card-top"></div>
          <div className="hero-card-lines"><i></i><i></i><i></i></div>
        </div>
      </section>

      <section className="content">
        <div className="section-heading">
          <div>
            <span className="eyebrow">EXPLORAR</span>
            <h2>Destaques</h2>
          </div>
          <div className="search">Buscar produtos ou serviços</div>
        </div>

        <div className="categories" role="list">
          {categories.map((category, index) => (
            <button className={index === 0 ? 'category active' : 'category'} key={category}>{category}</button>
          ))}
        </div>

        <div className="empty-state">
          <div className="empty-icon">+</div>
          <h3>Seu catálogo começa aqui</h3>
          <p>Os produtos e serviços cadastrados pelos lojistas aparecerão nesta área.</p>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);