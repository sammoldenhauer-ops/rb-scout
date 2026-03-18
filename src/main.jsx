import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App.jsx';

let mountNode = document.getElementById('root');
if (!mountNode) {
	mountNode = document.createElement('div');
	mountNode.id = 'root';
	document.body.appendChild(mountNode);
}

createRoot(mountNode).render(<App />);
