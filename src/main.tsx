import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppSliceBoardCustomPicker'
import './index.css'
import './slice-board-overrides.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
