import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppSliceBoardCalloutsV2'
import './index.css'
import './slice-board-overrides.css'
import './slice-board-callouts.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
