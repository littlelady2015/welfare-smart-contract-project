import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConfigProvider } from 'antd'
import 'antd/dist/reset.css'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#4a2a68',
          colorWarning: '#f0c84b',
          colorSuccess: '#39805f',
          borderRadius: 6,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
        },
        components: {
          Button: { controlHeight: 37, fontWeight: 600 },
          Input: { controlHeight: 34 },
          Modal: { borderRadiusLG: 6 },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)