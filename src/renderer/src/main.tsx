import React from 'react'
import ReactDOM from 'react-dom/client'
import { OutputDisplay, TimerControl } from './App'
import './fonts.css'
import './styles.css'

const params = new URLSearchParams(window.location.search)
const isOutput = params.get('mode') === 'output'
const displayId = Number(params.get('displayId') || 0)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOutput ? <OutputDisplay displayId={displayId} /> : <TimerControl />}
  </React.StrictMode>
)
