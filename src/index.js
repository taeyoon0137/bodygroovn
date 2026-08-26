import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root')

if (!container) {
  throw new Error('Unable to mount bodygroovn: #root was not found.')
}

createRoot(container).render(<App />)
