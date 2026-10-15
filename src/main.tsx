import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ProvedorDaLoja } from './estado'
import './estilos/global.css'

createRoot(document.getElementById('raiz')!).render(
  <React.StrictMode>
    <ProvedorDaLoja>
      <App />
    </ProvedorDaLoja>
  </React.StrictMode>,
)
