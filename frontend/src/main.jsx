import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, CssBaseline } from '@mui/material'
import theme from './theme'
import App from './App.jsx'
import { FeedbackProvider } from './components/FeedbackProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </ThemeProvider>
  </StrictMode>,
)
