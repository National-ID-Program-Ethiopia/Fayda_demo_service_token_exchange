import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const STORAGE_AT = 'esignet_mrp_access_token';

function navItems() {
  return [
    { to: '/app', label: 'Overview' },
    { to: '/app/accounts', label: 'Accounts' },
    { to: '/app/transfers', label: 'Transfers' },
    { to: '/app/loans', label: 'Loans' },
  ];
}

function initials(name) {
  if (!name) return 'RP';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.slice(0, 1).toUpperCase()).join('') || 'RP';
}

export default function BankLayout({ title, user, children }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const profile = useMemo(() => {
    const u = user && typeof user === 'object' ? user : null;
    if (!u) return null;
    const addr = u.address
      ? [u.address.zone, u.address.woreda, u.address.region].filter(Boolean).join(', ')
      : '';
    return {
      name: u.name || u.given_name || u.preferred_username || u.sub || 'Customer',
      sub: u.sub || '',
      email: u.email || '',
      phone: u.phone_number || '',
      gender: u.gender || '',
      birthdate: u.birthdate || '',
      nationality: u.nationality || '',
      address: addr,
    };
  }, [user]);

  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);

  const signOut = () => {
    try {
      sessionStorage.removeItem(STORAGE_AT);
      sessionStorage.removeItem('esignet_farmer_opaque');
      sessionStorage.removeItem('esignet_mock_te_ctx');
    } catch (_) {
      /* ignore */
    }
    nav('/', { replace: true });
  };

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>CB</div>
          <div>
            <div style={styles.bankName}>CAPITAL BANK</div>
            <div style={styles.bankTag}>Digital Banking Portal</div>
          </div>
        </div>

        <nav style={{ marginTop: 18 }}>
          {navItems().map((it) => {
            const active = loc.pathname === it.to;
            return (
              <Link
                key={it.to}
                to={it.to}
                style={{
                  ...styles.navItem,
                  ...(active ? styles.navItemActive : null),
                }}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div style={styles.sideFooter}>
          <div style={styles.secNote}>Protected by Fayda eKYC</div>
          <div style={styles.sideHint}>Token exchange enabled for cross-sector services.</div>
        </div>
      </aside>

      <div style={styles.main}>
        <header style={styles.header}>
          <div>
            <div style={styles.pageTitle}>{title}</div>
            <div style={styles.pageSub}>Secure session · OIDC + PKCE · Consent-aware token exchange</div>
          </div>
          <div style={styles.userBox}>
            {user?.picture ? (
              <img
                src={user.picture}
                alt="Profile"
                width={42}
                height={42}
                style={styles.avatarImg}
                referrerPolicy="no-referrer"
                onClick={() => setOpen((v) => !v)}
              />
            ) : (
              <div style={styles.avatar} onClick={() => setOpen((v) => !v)}>
                {initials(user?.name)}
              </div>
            )}
            <div style={{ minWidth: 220, cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
              <div style={styles.userName}>{user?.name || 'Customer'}</div>
              <div style={styles.userMeta}>{user?.email || user?.phone_number || user?.sub || ''}</div>
            </div>
            <div style={{ position: 'relative' }}>
              {open ? (
                <div style={styles.dropdown}>
                  <div style={styles.ddTitle}>Profile</div>
                  <div style={styles.ddRow}>
                    <span style={styles.ddK}>Customer ID</span>
                    <span style={styles.ddV}>{profile?.sub || '—'}</span>
                  </div>
                  <div style={styles.ddRow}>
                    <span style={styles.ddK}>Phone</span>
                    <span style={styles.ddV}>{profile?.phone || '—'}</span>
                  </div>
                  <div style={styles.ddRow}>
                    <span style={styles.ddK}>Email</span>
                    <span style={styles.ddV}>{profile?.email || '—'}</span>
                  </div>
                  <div style={styles.ddRow}>
                    <span style={styles.ddK}>Gender</span>
                    <span style={styles.ddV}>{profile?.gender || '—'}</span>
                  </div>
                  <div style={styles.ddRow}>
                    <span style={styles.ddK}>Birth date</span>
                    <span style={styles.ddV}>{profile?.birthdate || '—'}</span>
                  </div>
                  <div style={styles.ddRow}>
                    <span style={styles.ddK}>Nationality</span>
                    <span style={styles.ddV}>{profile?.nationality || '—'}</span>
                  </div>
                  <div style={styles.ddRow}>
                    <span style={styles.ddK}>Address</span>
                    <span style={styles.ddV}>{profile?.address || '—'}</span>
                  </div>
                  <button type="button" onClick={signOut} style={styles.signOut}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main style={styles.content}>{children}</main>
      </div>
    </div>
  );
}

const styles = {
  shell: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    background: 'radial-gradient(1200px 600px at 20% 0%, rgba(34,197,94,.10), transparent 60%), #0b1220',
    color: '#e5e7eb',
    fontFamily: 'system-ui, Segoe UI, Roboto, Arial, sans-serif',
  },
  sidebar: {
    borderRight: '1px solid rgba(148,163,184,.18)',
    padding: 18,
    background: 'rgba(15,23,42,.55)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column',
  },
  brand: { display: 'flex', gap: 12, alignItems: 'center' },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    background: 'linear-gradient(135deg, #f8c94e, #22c55e)',
    color: '#0b1220',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    letterSpacing: 0.4,
    boxShadow: '0 14px 40px rgba(0,0,0,.35)',
  },
  bankName: { fontWeight: 900, letterSpacing: 0.6, fontSize: 13 },
  bankTag: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  navItem: {
    display: 'block',
    padding: '10px 12px',
    borderRadius: 12,
    color: '#cbd5e1',
    textDecoration: 'none',
    border: '1px solid transparent',
    marginBottom: 8,
    background: 'transparent',
  },
  navItemActive: {
    background: 'rgba(248,201,78,.12)',
    border: '1px solid rgba(248,201,78,.35)',
    color: '#fde68a',
  },
  sideFooter: { marginTop: 'auto', paddingTop: 14, borderTop: '1px solid rgba(148,163,184,.16)' },
  secNote: { fontWeight: 800, fontSize: 12, color: '#f8c94e' },
  sideHint: { fontSize: 12, color: '#94a3b8', marginTop: 6, lineHeight: 1.4 },
  main: { display: 'flex', flexDirection: 'column' },
  header: {
    padding: '18px 22px',
    borderBottom: '1px solid rgba(148,163,184,.16)',
    background: 'rgba(2,6,23,.45)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 14,
    alignItems: 'center',
  },
  pageTitle: { fontWeight: 900, fontSize: 18 },
  pageSub: { marginTop: 4, color: '#94a3b8', fontSize: 12 },
  userBox: { display: 'flex', gap: 12, alignItems: 'center' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    background: 'rgba(148,163,184,.14)',
    border: '1px solid rgba(148,163,184,.22)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 900,
    color: '#e2e8f0',
    cursor: 'pointer',
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 999,
    objectFit: 'cover',
    border: '1px solid rgba(148,163,184,.22)',
    boxShadow: '0 12px 28px rgba(0,0,0,.35)',
    background: 'rgba(148,163,184,.14)',
    cursor: 'pointer',
  },
  userName: { fontWeight: 800, fontSize: 13 },
  userMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' },
  signOut: {
    width: '100%',
    marginTop: 10,
    background: 'transparent',
    color: '#e2e8f0',
    border: '1px solid rgba(148,163,184,.22)',
    padding: '10px 12px',
    borderRadius: 12,
    fontWeight: 900,
    cursor: 'pointer',
  },
  dropdown: {
    position: 'absolute',
    top: 0,
    right: 0,
    transform: 'translateY(54px)',
    width: 360,
    maxWidth: '90vw',
    padding: 12,
    borderRadius: 16,
    background: 'rgba(2,6,23,.92)',
    border: '1px solid rgba(148,163,184,.22)',
    boxShadow: '0 26px 70px rgba(0,0,0,.55)',
    zIndex: 50,
  },
  ddTitle: { fontWeight: 950, color: '#fde68a', marginBottom: 10 },
  ddRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid rgba(148,163,184,.12)',
  },
  ddK: { color: '#94a3b8', fontSize: 12, fontWeight: 900 },
  ddV: { color: '#e5e7eb', fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' },
  content: { padding: 22 },
};

