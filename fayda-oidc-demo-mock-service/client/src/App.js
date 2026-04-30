// src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import SignIn from './components/SignIn';
import Callback from './components/Callback';
import Dashboard from './components/pages/Dashboard';
import Loans from './components/pages/Loans';
import Transfers from './components/pages/Transfers';
import Accounts from './components/pages/Accounts';

function TokenExchangeConsentRedirect() {
  // eslint-disable-next-line no-underscore-dangle
  const base = (window._env_?.ESIGNET_UI_CONSENT_BASE_URL || window._env_?.ESIGNET_UI_BASE_URL || '').replace(/\/$/, '');
  const url = `${base}/token-exchange-consent${window.location.search || ''}`;
  window.location.replace(url);
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', color: '#111827' }}>
      Redirecting to token-exchange consent…
    </div>
  );
}


const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/userprofile" element={<Callback />} />
        <Route path="/callback" element={<Callback />} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/accounts" element={<Accounts />} />
        <Route path="/app/transfers" element={<Transfers />} />
        <Route path="/app/loans" element={<Loans />} />
        <Route path="/token-exchange-consent" element={<TokenExchangeConsentRedirect />} />
      </Routes>
    </Router>
  );
};

export default App;
