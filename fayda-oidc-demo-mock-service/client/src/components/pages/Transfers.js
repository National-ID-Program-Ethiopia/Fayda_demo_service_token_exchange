import React, { useEffect, useState } from 'react';
import BankLayout from '../layout/BankLayout';

const STORAGE_USER = 'capital_bank_user';

export default function Transfers() {
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
    <BankLayout title="Transfers" user={user}>
      <div style={styles.card}>
        <div style={styles.title}>Send money</div>
        <div style={styles.text}>
          This is a UI stub (no core banking integration). We keep it here to make the portal feel like a real bank app.
        </div>
        <div style={styles.form}>
          <div style={styles.field}>
            <div style={styles.label}>Beneficiary</div>
            <input style={styles.input} placeholder="Name or account number" />
          </div>
          <div style={styles.field}>
            <div style={styles.label}>Amount</div>
            <input style={styles.input} placeholder="ETB 0.00" />
          </div>
          <div style={styles.field}>
            <div style={styles.label}>Remark</div>
            <input style={styles.input} placeholder="Optional message" />
          </div>
          <button type="button" style={styles.btn}>
            Continue
          </button>
        </div>
      </div>
    </BankLayout>
  );
}

const styles = {
  card: {
    maxWidth: 820,
    borderRadius: 16,
    padding: 16,
    background: 'rgba(15,23,42,.55)',
    border: '1px solid rgba(148,163,184,.16)',
    boxShadow: '0 24px 70px rgba(0,0,0,.30)',
  },
  title: { fontWeight: 950, color: '#fde68a', marginBottom: 6 },
  text: { color: '#94a3b8', fontSize: 13, lineHeight: 1.5, marginBottom: 14 },
  form: { display: 'grid', gap: 12 },
  field: {},
  label: { fontSize: 12, color: '#cbd5e1', fontWeight: 800, marginBottom: 6 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    padding: '12px 12px',
    border: '1px solid rgba(148,163,184,.22)',
    background: 'rgba(2,6,23,.35)',
    color: '#e5e7eb',
    outline: 'none',
  },
  btn: {
    borderRadius: 12,
    padding: '12px 14px',
    border: 'none',
    background: 'linear-gradient(90deg, #22c55e, #16a34a)',
    color: '#052e16',
    fontWeight: 950,
    cursor: 'pointer',
  },
};

