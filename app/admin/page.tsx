'use client';

import React, { useState, useMemo } from 'react';
import { useData } from '@/components/DataProvider';
import AdminQuickCreate from '@/components/AdminQuickCreate';
import CreateHomeworkModal from '@/components/CreateHomeworkModal';
import CreateContentModal from '@/components/CreateContentModal';

export default function AdminDashboard() {
  const { allHomework, allUsers, learningContent, allProgress, refreshData } = useData();
  const [activeModal, setActiveModal] = useState<'homework' | 'content' | null>(null);

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

      {/* Section A: Summary Metrics */}
      <div className="metric-grid">
        {cards.map((card, i) => (
          <div key={i} className="admin-card" style={{ borderLeft: `4px solid ${card.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.5rem' }}>{card.title}</p>
                <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>{card.value}</h2>
              </div>
              <span style={{ fontSize: '1.5rem', opacity: 0.5 }}>{card.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Section B: Quick Create Hub */}
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem' }}>Quick Actions</h2>
        <AdminQuickCreate 
          onCreateHomework={() => setActiveModal('homework')} 
          onCreateContent={() => setActiveModal('content')} 
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
         {/* Recent Activity Table */}
        <div className="admin-card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem' }}>Latest Activity Log</h2>
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
                      background: activity.status === 'done' ? '#dcfce7' : '#fef9c3',
                      color: activity.status === 'done' ? '#166534' : '#854d0e'
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
           <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem' }}>System Status</h2>
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
           </div>
        </div>
      </div>

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
