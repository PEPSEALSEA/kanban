'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";
const UPLOAD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby7FOqHLZN24sWCwl7XP4maUSi_iCxEFcg6REG-F8qp2C33aJL0US1Ye8XTZ7qUBDC8fw/exec";
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
  image_url?: string;
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
  const [user, setUser] = useState<UserInfo | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('homework_user');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [allHomework, setAllHomework] = useState<Homework[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [allProgress, setAllProgress] = useState<ProgressItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [activeHomework, setActiveHomework] = useState<Homework | null>(null);
  const [shareText, setShareText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Homework>>({});

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadingAction("Synchronizing with Cloud...");
    try {
      const [hwRes, usersRes, progressRes] = await Promise.all([
        fetch(`${GAS_WEB_APP_URL}?action=list`).then(r => r.json()),
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
      setLoadingAction(null);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derived state: Homework with computed status based on current user's progress
  const homeworkWithStatus = useMemo(() => {
    return allHomework.map(hw => {
      const userProgress = allProgress.find(p =>
        String(p.email).toLowerCase() === String(user?.email).toLowerCase() &&
        String(p.homework_id) === String(hw.id)
      );
      return {
        ...hw,
        my_status: (userProgress?.status || 'pending') as 'pending' | 'in_progress' | 'done',
        // If progress entry has an image URL but the main hw doesn't, we can link it here if needed
      };
    });
  }, [allHomework, allProgress, user]);

  const handleLoginSuccess = async (credentialResponse: any) => {
    const decoded: any = jwtDecode(credentialResponse.credential);
    const newUser = {
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture
    };
    setUser(newUser);
    localStorage.setItem('homework_user', JSON.stringify(newUser));

    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'addUser',
          email: newUser.email,
          display_name: newUser.name,
          photo_url: newUser.picture
        })
      });
      fetchData();
    } catch (e) { console.error(e); }
  };

  const handleLogout = () => {
    googleLogout();
    setUser(null);
    localStorage.removeItem('homework_user');
    setAllHomework([]);
    fetchData();
  };

  const handleFileUpload = async (file: File, homeworkId: string, status: string): Promise<boolean> => {
    setIsUploading(true);
    setLoadingAction(`Uploading ${file.name}...`);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      const base64Data = await base64Promise;

      // Text-only base64 body + simple request (avoid preflight). We don't need to read response.
      await fetch(
        `${UPLOAD_WEB_APP_URL}?action=uploadProof&email=${encodeURIComponent(user?.email || '')}&homework_id=${encodeURIComponent(String(homeworkId))}&status=${encodeURIComponent(status)}&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        {
          method: 'POST',
          mode: 'no-cors',
          body: base64Data
        }
      );
      return true;
    } catch (error) {
      console.error("Upload failed:", error);
      return false;
    } finally {
      setIsUploading(false);
      setLoadingAction(null);
    }
  };

  const toggleComplete = async (e: React.MouseEvent, hwId: string, currentStatus?: string) => {
    e.stopPropagation();
    if (!user) return;
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';

    setAllHomework(prev => prev.map(hw =>
      String(hw.id) === String(hwId) ? { ...hw, my_status: newStatus as any } : hw
    ));

    setAllProgress(prev => {
      const filtered = prev.filter(p => !(p.email === user.email && String(p.homework_id) === String(hwId)));
      if (newStatus === 'done') {
        return [...filtered, { email: user.email, homework_id: String(hwId), status: 'done' }];
      }
      return filtered;
    });

    setLoadingAction("Updating Status...");
    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'updateProgress',
          email: user.email,
          homework_id: String(hwId),
          status: newStatus
        })
      });
      // Refresh data to get latest from server
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
    }
  };

  const uploadOrReplaceProof = async (e: React.MouseEvent, hwId: string) => {
    e.stopPropagation();
    if (!user) return;

    const current = allProgress.find(p => p.email === user.email && String(p.homework_id) === String(hwId));
    const currentStatus = current?.status || 'pending';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    const filePromise = new Promise<File | null>((resolve) => {
      input.onchange = (event: any) => {
        const file = event.target.files?.[0];
        resolve(file || null);
      };
    });

    input.click();
    const file = await filePromise;
    if (!file) return;

    const ok = await handleFileUpload(file, hwId, currentStatus);
    if (ok) await fetchData();
  };

  const handleDeleteHomework = async (id: string) => {
    if (!confirm("Are you sure you want to delete this homework?")) return;
    setLoadingAction("Deleting Homework...");
    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: new URLSearchParams({ action: 'deleteHomework', id })
      });
      fetchData();
      setActiveHomework(null);
    } catch (e) { console.error(e); }
    finally { setLoadingAction(null); }
  };

  const handleEditHomework = async () => {
    if (!activeHomework) return;
    setLoadingAction("Saving Changes...");
    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'editHomework',
          id: activeHomework.id,
          ...editForm as any
        })
      });
      setIsEditing(false);
      fetchData();
      // Update local modal data
      setActiveHomework(prev => prev ? { ...prev, ...editForm } : null);
    } catch (e) { console.error(e); }
    finally { setLoadingAction(null); }
  };

  const extractDriveId = (url: string) => {
    if (!url || !url.includes('http')) return null;
    // Handles lh3.googleusercontent.com/u/d/ID or drive.google.com/file/d/ID/view
    const parts = url.split('/');
    const dIdx = parts.indexOf('d');
    if (dIdx !== -1 && parts[dIdx + 1]) return parts[dIdx + 1];
    return null;
  };

  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const categorized = { soon: [] as Homework[], week: [] as Homework[], backlog: [] as Homework[] };
    homeworkWithStatus.forEach(hw => {
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
  }, [homeworkWithStatus]);

  const getFinishedUsers = (hwId: string) => {
    const finishedWithProgress = allProgress
      .filter(p => String(p.homework_id) === String(hwId) && p.status === 'done');

    return finishedWithProgress.map(p => {
      const u = allUsers.find(user => String(user.email).toLowerCase() === String(p.email).toLowerCase());
      return u ? { ...u, proof: p.image_url } : null;
    }).filter(u => u !== null) as (UserInfo & { proof?: string })[];
  };

  const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Global Loading Overlay (for critical actions) */}
      {loadingAction && loadingAction !== "Synchronizing with Cloud..." && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          cursor: 'wait'
        }}>
          <div className="loader" style={{
            width: '64px',
            height: '64px',
            border: '5px solid rgba(99, 102, 241, 0.2)',
            borderTop: '5px solid var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <div style={{
            color: '#fff',
            fontSize: '1.25rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            background: 'linear-gradient(to right, #818cf8, #f43f5e)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textAlign: 'center'
          }}>
            {loadingAction}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontWeight: 500 }}>Please wait while we handle the cloud transfer.</p>
        </div>
      )}

      {/* Top-Right Sync Pill (non-blocking) */}
      {loadingAction === "Synchronizing with Cloud..." && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0.75rem 1.25rem',
          background: 'rgba(30, 41, 59, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: '1rem',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          animation: 'slideInRight 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          <div className="loader" style={{
            width: '18px',
            height: '18px',
            border: '2px solid rgba(129, 140, 248, 0.2)',
            borderTop: '2px solid #818cf8',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}></div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>Syncing...</span>
        </div>
      )}

      <header style={{ padding: '1rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(15, 23, 42, 0.8)', position: 'sticky', top: 0, backdropFilter: 'blur(10px)', zIndex: 100 }}>
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
              <img src={user.picture} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid var(--primary)' }} alt="user" />
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user.name}</div>
                <button onClick={handleLogout} style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Logout</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ fontSize: '1.75rem', animation: 'bounce 2s infinite' }}>🎓</div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, background: 'linear-gradient(to right, #818cf8, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>การบ้าน 603</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
          {isAdmin && <Link href="/admin" className="glass" style={{ padding: '0.5rem 1.25rem', borderRadius: '0.75rem', background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', fontSize: '0.8rem', fontWeight: 700, border: '1px solid rgba(244, 63, 94, 0.3)', transition: '0.2s' }}>Console</Link>}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span> Live Cloud
          </div>
        </div>
      </header>

      {/* Trello-style Modal Overflow */}
      {activeHomework && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
          onClick={() => setActiveHomework(null)}
        >
          <div
            className="glass"
            style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '2rem', padding: '2.5rem', border: '1px solid rgba(255,255,255,0.1)', cursor: 'default' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
              <div style={{ flex: 1 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <input
                        className="glass"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.5rem', borderRadius: '0.5rem', flex: 1 }}
                        value={editForm.title}
                        onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        placeholder="Title"
                      />
                      <input
                        className="glass"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.5rem', borderRadius: '0.5rem', width: '150px' }}
                        value={editForm.subject}
                        onChange={e => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Subject"
                      />
                    </div>
                    <input
                      type="date"
                      className="glass"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.5rem', borderRadius: '0.5rem' }}
                      value={editForm.deadline}
                      onChange={e => setEditForm(prev => ({ ...prev, deadline: e.target.value }))}
                    />
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button onClick={handleEditHomework} style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}>Save Changes</button>
                      <button onClick={() => setIsEditing(false)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="card-tag" style={{ backgroundColor: `${getSubjectColor(activeHomework.subject)}25`, color: getSubjectColor(activeHomework.subject), border: `1px solid ${getSubjectColor(activeHomework.subject)}40`, fontWeight: 700, fontSize: '0.8rem', marginBottom: '1rem', display: 'inline-block' }}>
                      {activeHomework.subject}
                    </span>
                    <h2 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0 }}>{activeHomework.title}</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Deadline: {new Date(activeHomework.deadline).toLocaleDateString()}</p>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                        <button
                          onClick={() => { setIsEditing(true); setEditForm(activeHomework); }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.4rem 1rem', borderRadius: '0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}
                        >Edit Info</button>
                        <button
                          onClick={() => handleDeleteHomework(activeHomework.id)}
                          style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', color: '#f43f5e', padding: '0.4rem 1rem', borderRadius: '0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}
                        >Delete</button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={() => { setActiveHomework(null); setIsEditing(false); }}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem' }}
              >✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>📝 Description</h3>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '1rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, marginBottom: '2rem' }}>
                  {isEditing ? (
                    <textarea
                      className="glass"
                      style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '1rem', borderRadius: '0.5rem', width: '100%', minHeight: '150px', outline: 'none' }}
                      value={editForm.description}
                      onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Description"
                    />
                  ) : (
                    activeHomework.description || "No description provided."
                  )}
                </div>

                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>💬 Shared Files & Notes</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Share Input */}
                  <div className="glass" style={{ padding: '1rem', borderRadius: '1rem', background: 'rgba(99, 102, 241, 0.05)' }}>
                    <textarea
                      placeholder="Share a link or a message about this homework..."
                      style={{ width: '100%', background: 'none', border: 'none', color: '#fff', outline: 'none', resize: 'none', marginBottom: '1rem', fontSize: '0.9rem' }}
                      rows={2}
                      value={shareText}
                      onChange={(e) => setShareText(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8_px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <label className="glass" style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.7rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          📷 Image
                          <input type="file" multiple hidden accept="image/*" onChange={async (e) => {
                            const files = e.target.files;
                            if (files && files.length > 0 && user) {
                              setIsUploading(true);
                              for (let i = 0; i < files.length; i++) {
                                await handleFileUpload(files[i], activeHomework.id, 'done');
                              }
                              fetchData();
                            }
                          }} />
                        </label>
                        <label className="glass" style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.7rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          📎 File
                          <input type="file" multiple hidden onChange={async (e) => {
                            const files = e.target.files;
                            if (files && files.length > 0 && user) {
                              setIsUploading(true);
                              for (let i = 0; i < files.length; i++) {
                                await handleFileUpload(files[i], activeHomework.id, 'done');
                              }
                              fetchData();
                            }
                          }} />
                        </label>
                      </div>
                      <button
                        disabled={!shareText || isUploading}
                        onClick={async () => {
                          if (!user) return;
                          setLoadingAction("Posting share...");
                          try {
                            await fetch(GAS_WEB_APP_URL, {
                              method: 'POST',
                              body: new URLSearchParams({
                                action: 'updateProgress',
                                email: user.email,
                                homework_id: String(activeHomework.id),
                                status: 'done',
                                image_url: shareText // reusing field for text for now
                              })
                            });
                            setShareText("");
                            fetchData();
                          } catch (e) {
                            console.error(e);
                          } finally {
                            setLoadingAction(null);
                          }
                        }}
                        style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: (!shareText || isUploading) ? 0.5 : 1, fontSize: '0.85rem' }}
                      >Share</button>
                    </div>
                  </div>

                  {/* Shared Feed */}
                  {getFinishedUsers(activeHomework.id).map((student, i) => (
                    <div key={i} style={{ display: 'flex', gap: '1rem', padding: '1rem', borderRadius: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                      <img src={student.picture} style={{ width: '32px', height: '32px', borderRadius: '50%' }} alt="" />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{student.name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Finished</span>
                        </div>
                        {student.proof && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                            {student.proof.split(',').map((item, idx) => {
                              const isDriveFile = item.includes('drive.google.com/file/d/');
                              const isImageThumbnail = item.includes('googleusercontent.com/u/d/');
                              const isPlainText = !item.startsWith('http');

                              if (isPlainText) {
                                return <p key={idx} style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem' }}>{item}</p>;
                              }

                              return (
                                <div key={idx} style={{ position: 'relative', background: 'rgba(0,0,0,0.2)', borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  {isImageThumbnail ? (
                                    <img src={item} style={{ width: '100%', maxHeight: '250px', objectFit: 'contain', background: '#000' }} alt="Shared Attachment" />
                                  ) : (
                                    <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span style={{ fontSize: '1.5rem' }}>📄</span>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>Document Attachment</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Google Drive File</div>
                                      </div>
                                    </div>
                                  )}
                                  <div style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <a
                                      href={isImageThumbnail ? item.replace('googleusercontent.com/u/d/', 'drive.google.com/file/d/') + '/view' : item}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ fontSize: '0.7rem', color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', textDecoration: 'none' }}
                                    >
                                      {isImageThumbnail ? 'Open Original ↗' : 'View File ↗'}
                                    </a>
                                    {user?.email === student.email && (
                                      <button
                                        onClick={async () => {
                                          if (!confirm("Remove this attachment? This will also delete it from Drive.")) return;
                                          setLoadingAction("Deleting from Drive & Syncing...");

                                          // 1. Physically delete from Drive
                                          const driveId = extractDriveId(item);
                                          if (driveId) {
                                            try {
                                              await fetch(`${UPLOAD_WEB_APP_URL}?action=deleteFiles&driveIds=${driveId}`, { method: 'POST', mode: 'no-cors' });
                                            } catch (e) { console.error("Drive delete failed", e); }
                                          }

                                          // 2. Remove from Spreadsheet
                                          const remaining = student.proof?.split(',').filter(u => u !== item).join(',') || "";
                                          try {
                                            await fetch(GAS_WEB_APP_URL, {
                                              method: 'POST',
                                              body: new URLSearchParams({
                                                action: 'updateProgress',
                                                email: user.email,
                                                homework_id: String(activeHomework.id),
                                                status: 'done',
                                                image_url: remaining || ' '
                                              })
                                            });
                                            fetchData();
                                          } catch (e) { console.error(e); } finally { setLoadingAction(null); }
                                        }}
                                        style={{ fontSize: '0.7rem', color: '#ff4d4d', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                                      >Remove</button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Status</h3>
                {user && (
                  <button
                    onClick={async (e) => {
                      await toggleComplete(e, activeHomework.id, activeHomework.my_status);
                      // Update the local modal state too
                      const currentStatus = activeHomework.my_status;
                      const nextStatus = currentStatus === 'done' ? 'pending' : 'done';
                      setActiveHomework(prev => prev ? { ...prev, my_status: nextStatus as any } : null);
                    }}
                    style={{
                      padding: '1rem', borderRadius: '1rem', background: activeHomework.my_status === 'done' ? '#10b981' : 'rgba(255,255,255,0.05)',
                      border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                  >
                    {activeHomework.my_status === 'done' ? '✓ Finished' : 'Mark as Finish'}
                  </button>
                )}

                <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Students Done</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {getFinishedUsers(activeHomework.id).length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No one finished yet.</p>}
                  {getFinishedUsers(activeHomework.id).map(u => (
                    <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={u.picture} style={{ width: '24px', height: '24px', borderRadius: '50%' }} alt="" />
                      <span style={{ fontSize: '0.85rem' }}>{u.name}</span>
                    </div>
                  ))}
                </div>

                {activeHomework.link_work && (
                  <a href={activeHomework.link_work} target="_blank" rel="noreferrer" className="glass" style={{ padding: '1rem', borderRadius: '1rem', textAlign: 'center', fontWeight: 700, marginTop: 'auto', background: 'var(--bg-card)' }}>
                    🔗 Assignment Link
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="kanban-container" style={{ padding: '2rem 2.5rem', flex: 1 }}>
        {[
          { key: 'soon', title: '🔥 3 วันก่อนส่ง', items: columns.soon, color: '#f43f5e' },
          { key: 'week', title: '📅 7 วันก่อนส่ง', items: columns.week, color: '#f59e0b' },
          { key: 'backlog', title: '🐚 งานดองเค็ม', items: columns.backlog, color: '#6366f1' }
        ].map(col => (
          <div key={col.key} className="column glass" style={{ minWidth: '360px', borderTop: `4px solid ${col.color}` }}>
            <div className="column-header" style={{ padding: '0.5rem 0.5rem 1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="column-title" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{col.title}</h3>
                <span className="badge" style={{ padding: '4px 10px', fontSize: '0.8rem', borderRadius: '8px' }}>{col.items.length}</span>
              </div>
            </div>
            <div className="tasks-container">
              {!isLoading && col.items.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)', border: '2px dashed rgba(255,255,255,0.05)', borderRadius: '1.5rem' }}>
                  No active tasks
                </div>
              )}
              {col.items.map(hw => {
                const isDone = hw.my_status === 'done';
                const isExpanded = expandedId === hw.id;
                const completedBy = getFinishedUsers(hw.id);

                return (
                  <div
                    key={hw.id}
                    className={`card glass ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => setActiveHomework(hw)}
                    style={{
                      opacity: isDone ? 0.45 : 1,
                      filter: isDone ? 'grayscale(0.3)' : 'none',
                      transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      borderLeft: isDone ? '6px solid #10b981' : `6px solid ${getSubjectColor(hw.subject)}`,
                      cursor: 'pointer',
                      transform: isExpanded ? 'scale(1.02)' : 'scale(1)',
                      zIndex: isExpanded ? 10 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span className="card-tag" style={{ backgroundColor: `${getSubjectColor(hw.subject)}25`, color: getSubjectColor(hw.subject), border: `1px solid ${getSubjectColor(hw.subject)}40`, fontWeight: 700, fontSize: '0.7rem' }}>
                            {hw.subject}
                          </span>
                          {isDone && <span style={{ color: '#10b981', fontSize: '0.7rem', fontWeight: 800 }}>COMPLETED</span>}
                        </div>
                        <h4 style={{ margin: '0', textDecoration: isDone ? 'line-through' : 'none', fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3 }}>{hw.title}</h4>
                      </div>
                      {user && (
                        <div
                          onClick={(e) => toggleComplete(e, hw.id, hw.my_status)}
                          style={{ width: '28px', height: '28px', borderRadius: '8px', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? 'var(--primary)' : 'rgba(255,255,255,0.05)', transition: '0.3s', flexShrink: 0, marginLeft: '1rem' }}
                        >
                          {isDone && <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 900 }}>✓</span>}
                        </div>
                      )}
                    </div>

                    <div style={{
                      maxHeight: '45px',
                      overflow: 'hidden',
                      fontSize: '0.9rem',
                      lineHeight: 1.5,
                      color: 'rgba(255,255,255,0.6)',
                      marginTop: '1rem',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>
                      {hw.description}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deadline</span>
                        <div style={{ color: hw.deadline === new Date().toISOString().split('T')[0] ? '#f43f5e' : '#fff', fontWeight: 800, fontSize: '0.8rem' }}>{new Date(hw.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      </div>

                      {/* Facepile Section */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {completedBy.slice(0, 4).map((u, i) => (
                            <div key={u.email} style={{ position: 'relative' }} className="avatar-group">
                              <div
                                style={{ position: 'relative' }}
                                onMouseEnter={(e) => {
                                  const target = e.currentTarget.querySelector('.proof-preview') as HTMLElement;
                                  if (target) target.style.opacity = '1';
                                }}
                                onMouseLeave={(e) => {
                                  const target = e.currentTarget.querySelector('.proof-preview') as HTMLElement;
                                  if (target) target.style.opacity = '0';
                                }}
                              >
                                <img
                                  src={u.picture}
                                  style={{ width: '26px', height: '26px', borderRadius: '50%', border: '2px solid #1e293b', marginLeft: i === 0 ? 0 : '-10px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', cursor: 'help', transition: '0.2s' }}
                                  title={u.name}
                                />
                                {u.proof && (
                                  <div className="proof-preview" style={{
                                    position: 'absolute', bottom: '35px', left: '50%', transform: 'translateX(-50%)',
                                    width: '120px', height: '120px', background: '#1e293b', border: '2px solid var(--primary)',
                                    borderRadius: '8px', overflow: 'hidden', opacity: 0, pointerEvents: 'none', transition: '0.3s', zIndex: 1000,
                                    boxShadow: '0 10px 20px rgba(0,0,0,0.5)'
                                  }}>
                                    <img src={u.proof} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Proof" />
                                    <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.5rem', padding: '2px', textAlign: 'center' }}>Proof of completion</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {completedBy.length > 4 && (
                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, marginLeft: '-10px', border: '2px solid #1e293b' }}>
                              +{completedBy.length - 4}
                            </div>
                          )}
                        </div>
                        {completedBy.length > 0 && (
                          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                            {completedBy.length} {completedBy.length === 1 ? 'student' : 'students'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes slideInRight { 
          from { opacity: 0; transform: translateX(30px) scale(0.9); } 
          to { opacity: 1; transform: translateX(0) scale(1); } 
        }
        .card:hover { transform: translateY(-4px); box-shadow: 0 12px 25px rgba(0,0,0,0.5); border-color: rgba(255,255,255,0.2) !important; }
        .card.expanded { background: rgba(30, 41, 59, 0.95) !important; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
      `}</style>
    </main>
  );
}

function getSubjectColor(subject: string) {
  const colors: Record<string, string> = {
    'Math': '#6366f1',
    'Science': '#10b981',
    'History': '#f59e0b',
    'English': '#f43f5e',
    'Arts': '#ec4899',
    'Computer': '#8b5cf6',
    'Other': '#94a3b8'
  };
  return colors[subject] || colors['Other'];
}
