'use client';

import React, { useState, useMemo } from 'react';
import { useData } from '@/components/DataProvider';
import { API_URL } from '@/lib/config';
import AdminQuickCreate from '@/components/AdminQuickCreate';
import CreateHomeworkModal from '@/components/CreateHomeworkModal';
import CreateContentModal from '@/components/CreateContentModal';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { isAdminEmail } from '@/lib/admin';
import AdminAnalyticsPanel from '@/components/AdminAnalyticsPanel';

export default function AdminDashboard() {
  const { allHomework, allUsers, learningContent, allProgress, analytics, refreshData } = useData();

  const studentAnalytics = useMemo(
    () => (analytics || []).filter((a) => !isAdminEmail(a.email)),
    [analytics]
  );
  const [activeModal, setActiveModal] = useState<'homework' | 'content' | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics'>('dashboard');
  const { isMobile } = useDeviceDetection();
  const [isFixingSheets, setIsFixingSheets] = useState(false);

  const handleFixSheets = async () => {
    if (!window.confirm("This will synchronize Google Sheets headers with the database schema. Continue?")) return;
    setIsFixingSheets(true);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fixSheetHeaders' })
      });
      const data = await res.json();
      if (data.success) {
        alert("Sheets updated successfully:\n" + data.data.join("\n"));
      } else {
        alert("Error: " + data.error);
      }
    } catch (e: any) {
      alert("Failed to fix sheets: " + e.message);
    } finally {
      setIsFixingSheets(false);
    }
  };

  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      totalUsers: allUsers.length,
      activeTasks: allHomework.filter(hw => hw.my_status !== 'done').length,
      totalContent: learningContent.length,
      upcomingDeadlines: allHomework.filter(hw => {
        const deadline = new Date(hw.deadline);
        return deadline >= today && deadline <= next7Days;
      }).length,
      recentActivity: allProgress.slice(-5).reverse()
    };
  }, [allHomework, allUsers, learningContent, allProgress]);

  const cards = [
    { title: 'Total Students', value: metrics.totalUsers, icon: '👥', color: '#2563eb' },
    { title: 'Active Tasks', value: metrics.activeTasks, icon: '📋', color: '#0d9488' },
    { title: 'Learning Materials', value: metrics.totalContent, icon: '📚', color: '#8b5cf6' },
    { title: 'Upcoming Deadlines', value: metrics.upcomingDeadlines, icon: '⏳', color: '#f59e0b' },
  ];

  return (
    <div className="admin-dashboard">
      <header style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>Admin Dashboard</h1>
        <p style={{ color: 'var(--admin-text-muted)' }}>Welcome back! Here's what's happening in StudyFlow today.</p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid var(--admin-border)', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('dashboard')}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'dashboard' ? '3px solid var(--admin-primary)' : '3px solid transparent',
            color: activeTab === 'dashboard' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          Dashboard
        </button>
        <button 
          onClick={() => setActiveTab('analytics')}
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'none', 
            border: 'none', 
            borderBottom: activeTab === 'analytics' ? '3px solid var(--admin-primary)' : '3px solid transparent',
            color: activeTab === 'analytics' ? 'var(--admin-primary)' : 'var(--admin-text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '1rem'
          }}
        >
          Analytics
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* Section A: Summary Metrics */}
      <div className="metric-grid">
        {cards.map((card, i) => (
          <div key={i} className="admin-card" style={{ borderLeft: `4px solid ${card.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.5rem' }}>{card.title}</p>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>{card.value}</h2>
              </div>
              <span style={{ fontSize: '1.5rem', opacity: 0.5 }}>{card.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Section B: Quick Create Hub */}
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--admin-text-main)' }}>Quick Actions</h2>
        <AdminQuickCreate 
          onCreateHomework={() => setActiveModal('homework')} 
          onCreateContent={() => setActiveModal('content')} 
        />
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', 
        gap: '2rem' 
      }}>
         {/* Recent Activity Table */}
        <div className="admin-card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--admin-text-main)' }}>Latest Activity Log</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Task ID</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recentActivity.map((activity, i) => (
                <tr key={i}>
                  <td>{activity.email}</td>
                  <td>#{activity.homework_id}</td>
                  <td>
                    <span style={{ 
                      padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                      background: activity.status === 'done' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: activity.status === 'done' ? '#10b981' : '#f59e0b',
                      border: `1px solid ${activity.status === 'done' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                    }}>
                      {activity.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: 'var(--admin-text-muted)' }}>
                    {new Date(activity.updated_at || Date.now()).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* System Health / Status */}
        <div className="admin-card">
           <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--admin-text-main)' }}>System Status</h2>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--admin-text-muted)' }}>Backend Connection</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--admin-text-muted)' }}>Google Drive Storage</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Connected</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--admin-text-muted)' }}>Discord Webhooks</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Enabled</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--admin-border)' }}>
                <span style={{ color: 'var(--admin-text-muted)' }}>Database Schema</span>
                <button 
                  onClick={handleFixSheets}
                  disabled={isFixingSheets}
                  style={{ 
                    background: isFixingSheets ? 'var(--admin-text-muted)' : 'var(--admin-primary)', 
                    color: 'white', 
                    padding: '0.4rem 0.8rem', 
                    borderRadius: '0.4rem', 
                    border: 'none', 
                    cursor: isFixingSheets ? 'not-allowed' : 'pointer', 
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}>
                  {isFixingSheets ? 'Syncing...' : 'Fix Sheet Headers'}
                </button>
              </div>
           </div>
        </div>
      </div>
      </>
      )}

      {activeTab === 'analytics' && (
        <AdminAnalyticsPanel analytics={studentAnalytics} />
      )}

      {/* Modals */}
      {activeModal === 'homework' && (
        <CreateHomeworkModal onClose={() => setActiveModal(null)} onRefresh={refreshData} />
      )}
      {activeModal === 'content' && (
        <CreateContentModal onClose={() => setActiveModal(null)} onRefresh={refreshData} />
      )}
    </div>
  );
}
