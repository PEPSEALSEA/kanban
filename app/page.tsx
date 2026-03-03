'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";

// Admins who get the "Admin Console" button
const ADMIN_EMAILS = ['pepsealsea@gmail.com', 'iampep2009@gmail.com'];

type UserInfo = {
  email: string;
  name: string;
  picture: string;
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
  my_status: 'pending' | 'in_progress' | 'done';
};

type ColumnType = 'todo' | 'in-progress' | 'done';

const STATUS_MAP: Record<string, ColumnType> = {
  'pending': 'todo',
  'in_progress': 'in-progress',
  'done': 'done'
};

const COLUMN_TO_STATUS: Record<ColumnType, string> = {
  'todo': 'pending',
  'in-progress': 'in_progress',
  'done': 'done'
};

export default function HomeworkSorter() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [tasks, setTasks] = useState<Record<ColumnType, Homework[]>>({
    todo: [],
    'in-progress': [],
    done: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [sourceCol, setSourceCol] = useState<ColumnType | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('homework_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const fetchHomework = useCallback(async (email: string) => {
    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.includes("YOUR_GAS")) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${GAS_WEB_APP_URL}?action=listWithProgress&email=${encodeURIComponent(email)}`);
      const result = await response.json();
      if (result.success) {
        const sorted: Record<ColumnType, Homework[]> = { todo: [], 'in-progress': [], done: [] };
        result.data.forEach((hw: Homework) => {
          const col = STATUS_MAP[hw.my_status] || 'todo';
          sorted[col].push(hw);
        });
        setTasks(sorted);
      }
    } catch (error) {
      console.error("Failed to fetch homework:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.email) {
      fetchHomework(user.email);
    }
  }, [user, fetchHomework]);

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
    } catch (e) {
      console.error("Failed to sync user:", e);
    }
  };

  const handleLogout = () => {
    googleLogout();
    setUser(null);
    localStorage.removeItem('homework_user');
    setTasks({ todo: [], 'in-progress': [], done: [] });
  };

  const updateStatusOnServer = async (taskId: string, newStatus: string) => {
    if (!user || !GAS_WEB_APP_URL) return;
    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateProgress',
          email: user.email,
          homework_id: String(taskId),
          status: newStatus
        })
      });
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const onDragStart = (e: React.DragEvent, taskId: string, col: ColumnType) => {
    setDraggedTaskId(taskId);
    setSourceCol(col);
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    if (target.classList.contains('column')) {
      target.classList.add('drag-over');
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  };

  const onDrop = async (e: React.DragEvent, targetCol: ColumnType) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (!draggedTaskId || !sourceCol || sourceCol === targetCol || !user) return;

    const taskToMove = tasks[sourceCol].find(t => String(t.id) === String(draggedTaskId));
    if (!taskToMove) return;

    const newStatus = COLUMN_TO_STATUS[targetCol];

    // Optimistic Update
    setTasks(prev => {
      const newSourceArr = prev[sourceCol].filter(t => String(t.id) !== String(draggedTaskId));
      const newTargetArr = [...prev[targetCol], { ...taskToMove, my_status: newStatus as any }];
      return { ...prev, [sourceCol]: newSourceArr, [targetCol]: newTargetArr };
    });

    setDraggedTaskId(null);
    setSourceCol(null);

    // Sync with Server
    await updateStatusOnServer(draggedTaskId, newStatus);
  };

  if (!user) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
        <div className="glass" style={{ padding: '3.5rem', borderRadius: '2rem', width: '100%', maxWidth: '450px', textAlign: 'center' }}>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'var(--primary)', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', boxShadow: '0 0 30px rgba(99, 102, 241, 0.4)' }}>
              🎓
            </div>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', background: 'linear-gradient(to right, #6366f1, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800 }}>
              StudyFlow
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>The ultimate homework organization board.</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={() => console.log('Login Failed')}
              useOneTap
              theme="filled_black"
              shape="pill"
            />
          </div>

          <p style={{ marginTop: '2rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
            Securely login with your Google account to get started.
          </p>
        </div>
      </main>
    );
  }

  const getSubjectColor = (subject: string) => {
    const colors: Record<string, string> = {
      'Math': '#3b82f6',
      'Science': '#10b981',
      'History': '#f59e0b',
      'English': '#ef4444',
      'Arts': '#ec4899',
      'Computer': '#6d28d9',
      'Other': '#6366f1'
    };
    return colors[subject] || colors['Other'];
  };

  const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1.25rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '1.5rem', background: 'var(--primary)', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(99, 102, 241, 0.3)' }}>🎓</div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, background: 'linear-gradient(to right, #6366f1, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              StudyFlow
            </h1>
          </div>
        </div>

        <div className="glass" style={{ padding: '0.5rem 0.75rem', borderRadius: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {isAdmin && (
            <Link href="/admin" className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(244, 63, 94, 0.2)', transition: 'all 0.3s' }}>
              Admin Console
            </Link>
          )}

          <div style={{ height: '24px', width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)' }}>{user.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{user.email}</div>
            </div>
            <img
              src={user.picture}
              alt="profile"
              style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid var(--primary)' }}
            />
            <button
              onClick={handleLogout}
              className="glass"
              style={{ padding: '0.4rem', borderRadius: '0.5rem', color: 'var(--text-muted)', cursor: 'pointer', border: 'none', background: 'rgba(255,255,255,0.05)' }}
              title="Logout"
            >
              🚪
            </button>
          </div>
        </div>
      </header>

      <div className="kanban-container">
        {(['todo', 'in-progress', 'done'] as ColumnType[]).map(col => (
          <div
            key={col}
            className="column glass"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, col)}
          >
            <div className="column-header">
              <h3 className="column-title">
                {col === 'todo' && '📚 To Do'}
                {col === 'in-progress' && '✍️ In Progress'}
                {col === 'done' && '🎉 Done'}
                <span className="badge">{tasks[col].length}</span>
              </h3>
            </div>

            <div className="tasks-container">
              {isLoading && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', animation: 'pulse 1.5s infinite' }}>Refreshing board...</div>}
              {!isLoading && tasks[col].length === 0 && (
                <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.825rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                  All caught up!
                </div>
              )}
              {tasks[col].map(hw => (
                <div
                  key={hw.id}
                  className="card glass"
                  draggable
                  onDragStart={(e) => onDragStart(e, hw.id, col)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <span className="card-tag" style={{ backgroundColor: `${getSubjectColor(hw.subject)}22`, color: getSubjectColor(hw.subject), border: `1px solid ${getSubjectColor(hw.subject)}44` }}>
                      {hw.subject}
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Deadline</div>
                      <div style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600 }}>{new Date(hw.deadline).toLocaleDateString()}</div>
                    </div>
                  </div>

                  <h4 className="card-title" style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.75rem' }}>{hw.title}</h4>
                  <p className="card-desc" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>{hw.description}</p>

                  {hw.link_work && (
                    <a href={hw.link_work} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--primary)', padding: '0.6rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '0.5rem', marginBottom: '1rem', textDecoration: 'none', transition: '0.2s' }}>
                      <span>🔗</span> View Assignment
                    </a>
                  )}

                  <div className="footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>#{hw.id}</span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {hw.note && <span title={hw.note} style={{ cursor: 'help' }}>📝</span>}
                      {hw.link_image && <span title="Image attached" style={{ cursor: 'help' }}>🖼️</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 0.7; }
          100% { opacity: 0.4; }
        }
      `}</style>
    </main>
  );
}
