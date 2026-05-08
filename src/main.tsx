import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppSliceBoardMobileCleanup'
import './index.css'
import './slice-board-overrides.css'
import './slice-board-callouts.css'
import './slice-board-multi-pie.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
