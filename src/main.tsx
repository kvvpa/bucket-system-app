import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './AppSliceBoardVNext'
import './index.css'
import './slice-board-overrides.css'
import './slice-board-callouts.css'
import './slice-board-multi-pie.css'
import './slice-board-vnext.css'
import './slice-board-vnext-mobile.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
