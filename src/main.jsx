import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App/>);
