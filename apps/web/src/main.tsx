import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import 'reactflow/dist/style.css';
import './index.css';
import App from './App';
createRoot(document.getElementById('root')!).render(<App />);
