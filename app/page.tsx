'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";
const ADMIN_EMAILS = ['pepsealsea@gmail.com', 'iampep2009@gmail.com'];

type UserInfo = {
  email: string;
  name: string;
  picture: string;
};

type ProgressItem = {
  email: string;
  homework_id: string;
  status: string;
};

type Homework = {
  id: string;
  subject: string;
  title: string;
  description: string;
  deadline: string;
  link_work: string;
  link_image: string;
  note: string;
  my_status?: 'pending' | 'in_progress' | 'done';
};

export default function StudyFlow() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [allHomework, setAllHomework] = useState<Homework[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [allProgress, setAllProgress] = useState<ProgressItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load user from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('homework_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const fetchData = useCallback(async (email?: string) => {
    setIsLoading(true);
    try {
      // Parallel fetch for board data, users, and all progress
      const action = email ? 'listWithProgress' : 'list';
      const [hwRes, usersRes, progressRes] = await Promise.all([
        fetch(`${GAS_WEB_APP_URL}?action=${action}${email ? `&email=${encodeURIComponent(email)}` : ''}`).then(r => r.json()),
        fetch(`${GAS_WEB_APP_URL}?action=users`).then(r => r.json()),
        fetch(`${GAS_WEB_APP_URL}?action=allProgress`).then(r => r.json())
      ]);

      if (hwRes.success) setAllHomework(hwRes.data);
      if (usersRes.success) setAllUsers(usersRes.data);
      if (progressRes.success) setAllProgress(progressRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(user?.email);
  }, [user, fetchData]);

  const handleLoginSuccess = async (credentialResponse: any) => {
    const decoded: any = jwtDecode(credentialResponse.credential);
    const newUser = {
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture
    };
    setUser(newUser);
    localStorage.setItem('homework_user', JSON.stringify(newUser));

    // Sync user with GAS
    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addUser',
          email: newUser.email,
          display_name: newUser.name,
          photo_url: newUser.picture
        })
      });
      fetchData(newUser.email);
    } catch (e) { console.error(e); }
  };

  const handleLogout = () => {
    googleLogout();
    setUser(null);
    localStorage.removeItem('homework_user');
    setAllHomework([]);
    fetchData();
  };

  const toggleComplete = async (e: React.MouseEvent, hwId: string, currentStatus?: string) => {
    e.stopPropagation(); // Don't expand when clicking checkbox
    if (!user) return;
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';

    // Optimistic UI Update
    setAllHomework(prev => prev.map(hw =>
      String(hw.id) === String(hwId) ? { ...hw, my_status: newStatus as any } : hw
    ));

    // Update local "allProgress" for immediate avatar update
    setAllProgress(prev => {
      const filtered = prev.filter(p => !(p.email === user.email && String(p.homework_id) === String(hwId)));
      if (newStatus === 'done') {
        return [...filtered, { email: user.email, homework_id: String(hwId), status: 'done' }];
      }
      return filtered;
    });

    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateProgress',
          email: user.email,
          homework_id: String(hwId),
          status: newStatus
        })
      });
    } catch (e) { console.error(e); }
  };

  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const categorized = { soon: [] as Homework[], week: [] as Homework[], backlog: [] as Homework[] };
    allHomework.forEach(hw => {
      const deadline = new Date(hw.deadline);
      const diffTime = deadline.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 3) categorized.soon.push(hw);
      else if (diffDays <= 7) categorized.week.push(hw);
      else categorized.backlog.push(hw);
    });

    const sortFn = (a: Homework, b: Homework) => {
      if (a.my_status === 'done' && b.my_status !== 'done') return 1;
      if (a.my_status !== 'done' && b.my_status === 'done') return -1;
      return 0;
    };

    return {
      soon: categorized.soon.sort(sortFn),
      week: categorized.week.sort(sortFn),
      backlog: categorized.backlog.sort(sortFn)
    };
  }, [allHomework]);

  // Helper to find users who finished a homework
  const getFinishedUsers = (hwId: string) => {
    const finishedEmails = allProgress
      .filter(p => String(p.homework_id) === String(hwId) && p.status === 'done')
      .map(p => p.email);

    return allUsers.filter(u => finishedEmails.includes(u.email));
  };

  const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {!user ? (
            <div className="login-trigger">
              <GoogleLogin
                onSuccess={handleLoginSuccess}
                onError={() => console.log('Login Failed')}
                theme="filled_blue" shape="pill" size="medium" text="signin_with"
              />
            </div>
          ) : (
            <div className="glass" style={{ padding: '0.4rem 0.8rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <img src={user.picture} style={{ width: '32px', height: '32px', borderRadius: '50%' }} alt="user" />
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user.name}</div>
                <button onClick={handleLogout} style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Logout</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
            <div style={{ fontSize: '1.5rem' }}>🎓</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(to right, #6366f1, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>การบ้าน 603</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isAdmin && <Link href="/admin" className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(244, 63, 94, 0.2)' }}>Admin Console</Link>}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}> <span style={{ color: '#10b981' }}>●</span> Live Data</div>
        </div>
      </header>

      <div className="kanban-container" style={{ padding: '2rem 2.5rem' }}>
        {[
          { key: 'soon', title: '🔥 3 วันก่อนส่ง', items: columns.soon },
          { key: 'week', title: '📅 7 วันก่อนส่ง', items: columns.week },
          { key: 'backlog', title: '🐚 งานดองเค็ม', items: columns.backlog }
        ].map(col => (
          <div key={col.key} className="column glass" style={{ minWidth: '350px' }}>
            <div className="column-header" style={{ paddingBottom: '1rem' }}>
              <h3 className="column-title" style={{ fontSize: '1.25rem' }}>{col.title} <span className="badge">{col.items.length}</span></h3>
            </div>
            <div className="tasks-container">
              {isLoading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Refreshing list...</div>}
              {col.items.map(hw => {
                const isDone = hw.my_status === 'done';
                const isExpanded = expandedId === hw.id;
                const completedBy = getFinishedUsers(hw.id);

                return (
                  <div
                    key={hw.id}
                    className="card glass"
                    onClick={() => setExpandedId(isExpanded ? null : hw.id)}
                    style={{
                      opacity: isDone ? 0.4 : 1,
                      filter: isDone ? 'grayscale(0.5)' : 'none',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      borderLeft: isDone ? '4px solid #10b981' : `4px solid ${getSubjectColor(hw.subject)}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <span className="card-tag" style={{ backgroundColor: `${getSubjectColor(hw.subject)}22`, color: getSubjectColor(hw.subject), border: `1px solid ${getSubjectColor(hw.subject)}44` }}>
                          {hw.subject}
                        </span>
                        <h4 style={{ margin: '0.75rem 0 0.5rem', textDecoration: isDone ? 'line-through' : 'none', fontSize: '1.1rem' }}>{hw.title}</h4>
                      </div>
                      {user && (
                        <div
                          onClick={(e) => toggleComplete(e, hw.id, hw.my_status)}
                          style={{ width: '24px', height: '24px', borderRadius: '6px', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? 'var(--primary)' : 'transparent', transition: '0.2s', marginTop: '4px' }}
                        >
                          {isDone && <span style={{ color: '#fff', fontSize: '0.8rem' }}>✓</span>}
                        </div>
                      )}
                    </div>

                    <div style={{
                      maxHeight: isExpanded ? '500px' : '40px',
                      overflow: 'hidden',
                      transition: 'all 0.4s ease',
                      fontSize: '0.85rem',
                      color: isExpanded ? 'var(--text-main)' : 'var(--text-muted)',
                      marginTop: '0.5rem'
                    }}>
                      {hw.description}
                    </div>

                    {isExpanded && hw.note && (
                      <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.5rem', fontSize: '0.8rem', borderLeft: '2px solid var(--primary)' }}>
                        <strong>Note:</strong> {hw.note}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.75rem' }}>Due: {new Date(hw.deadline).toLocaleDateString('th-TH')}</div>

                      {/* Avatars of people who finished */}
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {completedBy.slice(0, 5).map((u, i) => (
                          <img
                            key={u.email}
                            src={u.picture}
                            title={u.name}
                            style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid var(--card-bg)', marginLeft: i === 0 ? 0 : '-8px', transition: 'transform 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                          />
                        ))}
                        {completedBy.length > 5 && (
                          <span style={{ fontSize: '0.65rem', marginLeft: '5px', color: 'var(--text-muted)' }}>+{completedBy.length - 5}</span>
                        )}
                        {completedBy.length > 0 && <span style={{ fontSize: '0.65rem', marginLeft: '5px', color: 'var(--text-muted)' }}>✅ finished</span>}
                      </div>
                    </div>

                    {isExpanded && hw.link_work && (
                      <a
                        href={hw.link_work}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: 'block', marginTop: '1rem', padding: '0.6rem', background: 'var(--primary)', color: '#fff', borderRadius: '0.5rem', textAlign: 'center', textDecoration: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                      >
                        🔗 Click to Open Work Link
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function getSubjectColor(subject: string) {
  const colors: Record<string, string> = {
    'Math': '#3b82f6', 'Science': '#10b981', 'History': '#f59e0b', 'English': '#ef4444', 'Arts': '#ec4899', 'Computer': '#6d28d9', 'Other': '#6366f1'
  };
  return colors[subject] || colors['Other'];
}
