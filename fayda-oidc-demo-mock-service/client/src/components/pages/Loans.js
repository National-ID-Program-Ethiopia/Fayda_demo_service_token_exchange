import React, { useEffect, useState } from 'react';
import BankLayout from '../layout/BankLayout';
import CrossSectorPanel from '../CrossSectorPanel';

const STORAGE_USER = 'capital_bank_user';

export default function Loans() {
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
    <BankLayout title="Loans" user={user}>
      <div style={styles.wrap}>
        <div style={styles.hero}>
          <div style={styles.hTitle}>Personal & SME Loans</div>
          <div style={styles.hText}>
            Offers are personalized using your verified eKYC profile. No paperwork for pre-approved products.
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Salary-backed loan</div>
            <div style={styles.cardText}>Up to 24 months · Competitive rate · Instant decision</div>
            <button type="button" style={styles.btn}>
              Check eligibility
            </button>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>SME working capital</div>
            <div style={styles.cardText}>Short-term liquidity for business operations and inventory</div>
            <button type="button" style={styles.btn}>
              Apply
            </button>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Agriculture equipment</div>
            <div style={styles.cardText}>Cross-sector enabled: verify farmer profile via token exchange</div>
            <button type="button" style={styles.btnSecondary}>
              Verify farmer profile
            </button>
          </div>
        </div>

        <CrossSectorPanel title="Verify farmer profile (Agriculture)" />
      </div>
    </BankLayout>
  );
}

const styles = {
  wrap: { maxWidth: 1100 },
  hero: {
    borderRadius: 18,
    padding: 18,
    background: 'linear-gradient(135deg, rgba(248,201,78,.10), rgba(34,197,94,.08))',
    border: '1px solid rgba(148,163,184,.16)',
    marginBottom: 14,
  },
  hTitle: { fontWeight: 950, fontSize: 18, color: '#fde68a' },
  hText: { marginTop: 6, color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  card: {
    borderRadius: 16,
    padding: 16,
    background: 'rgba(15,23,42,.55)',
    border: '1px solid rgba(148,163,184,.16)',
    boxShadow: '0 24px 70px rgba(0,0,0,.30)',
  },
  cardTitle: { fontWeight: 900, marginBottom: 6 },
  cardText: { color: '#94a3b8', fontSize: 13, lineHeight: 1.5, marginBottom: 12 },
  btn: {
    width: '100%',
    borderRadius: 12,
    padding: '10px 12px',
    border: 'none',
    background: 'linear-gradient(90deg, #f8c94e, #f59e0b)',
    color: '#0b1220',
    fontWeight: 900,
    cursor: 'pointer',
  },
  btnSecondary: {
    width: '100%',
    borderRadius: 12,
    padding: '10px 12px',
    border: '1px solid rgba(248,201,78,.35)',
    background: 'rgba(248,201,78,.08)',
    color: '#fde68a',
    fontWeight: 900,
    cursor: 'pointer',
  },
};

