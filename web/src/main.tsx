import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ProveedorRol } from './contexto/Rol.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorRol>
      <App />
    </ProveedorRol>
  </StrictMode>,
)
