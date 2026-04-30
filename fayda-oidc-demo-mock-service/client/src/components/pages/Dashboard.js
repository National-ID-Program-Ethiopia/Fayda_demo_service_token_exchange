import React, { useEffect, useState } from 'react';
import BankLayout from '../layout/BankLayout';
import CrossSectorPanel from '../CrossSectorPanel';

const STORAGE_USER = 'capital_bank_user';

export default function Dashboard() {
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
    <BankLayout title="Overview" user={user}>
      <div style={styles.grid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Welcome back</div>
          <div style={styles.cardText}>
            Your account is secured with Fayda eKYC. Use the left menu to navigate banking services.
          </div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Quick actions</div>
          <div style={styles.cardText}>
            Go to <strong>Loans</strong> to see pre-approved offers, or <strong>Transfers</strong> to send money.
          </div>
        </div>
        <div style={styles.cardWide}>
          <div style={styles.cardTitle}>Cross-sector access (Token exchange)</div>
          <div style={styles.cardText}>
            After login, you can exchange your token to access Agriculture services and view your Farmer profile.
            Use the panel below to run token exchange, handle first-time consent, and open the Farmer portal.
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <CrossSectorPanel />
        </div>
      </div>
    </BankLayout>
  );
}

const styles = {
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  card: {
    borderRadius: 16,
    padding: 16,
    background: 'rgba(15,23,42,.55)',
    border: '1px solid rgba(148,163,184,.16)',
    boxShadow: '0 24px 70px rgba(0,0,0,.30)',
  },
  cardWide: {
    gridColumn: '1 / -1',
    borderRadius: 16,
    padding: 16,
    background: 'rgba(15,23,42,.55)',
    border: '1px solid rgba(148,163,184,.16)',
    boxShadow: '0 24px 70px rgba(0,0,0,.30)',
  },
  cardTitle: { fontWeight: 900, marginBottom: 6, color: '#fde68a' },
  cardText: { color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 },
};

