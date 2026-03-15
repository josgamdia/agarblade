import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './App.css';
import { connect } from './game/connection.js';

// Start WebSocket connection immediately
connect();

createRoot(document.getElementById('root')).render(<App />);
