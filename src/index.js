import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import App from './App';
import { ContextProvider } from './context/ContextProvider';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ContextProvider>
      <App />
      <ToastContainer 
        position='top-center'
        autoClose={3000}
        closeOnClick
      />
    </ContextProvider>
  </React.StrictMode>
);

reportWebVitals();
