import React, { useEffect, useState } from 'react';
import BankLayout from '../layout/BankLayout';

const STORAGE_USER = 'capital_bank_user';

export default function Accounts() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_USER);
      if (raw) setUser(JSON.parse(raw));
    } catch (_) {
      /* ignore */
    }
  }, []);

  return (
    <BankLayout title="Accounts" user={user}>
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.k}>Current account</div>
          <div style={styles.v}>ETB 12,480.50</div>
          <div style={styles.m}>•••• 0192 · Capital Bank</div>
        </div>
        <div style={styles.card}>
          <div style={styles.k}>Savings</div>
          <div style={styles.v}>ETB 98,100.00</div>
          <div style={styles.m}>•••• 7744 · Capital Bank</div>
        </div>
      </div>
    </BankLayout>
  );
}

const styles = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 900 },
  card: {
    borderRadius: 16,
    padding: 16,
    background: 'rgba(15,23,42,.55)',
    border: '1px solid rgba(148,163,184,.16)',
    boxShadow: '0 24px 70px rgba(0,0,0,.30)',
  },
  k: { color: '#94a3b8', fontSize: 12, fontWeight: 900 },
  v: { marginTop: 10, fontSize: 22, fontWeight: 950, color: '#fde68a' },
  m: { marginTop: 8, color: '#cbd5e1', fontSize: 12 },
};

