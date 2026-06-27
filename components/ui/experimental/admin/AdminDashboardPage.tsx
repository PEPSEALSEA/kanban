'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useData } from '@/components/DataProvider';
import { API_URL } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import AdminQuickCreate from '@/components/AdminQuickCreate';
import CreateHomeworkModal from '@/components/CreateHomeworkModal';
import CreateContentModal from '@/components/CreateContentModal';
import ExperimentalAdminAnalyticsPanel, { AnimatedAdminTabContent } from '@/components/ui/experimental/admin/ExperimentalAdminAnalyticsPanel';
import { Badge, Button, Card, Tabs } from '@/components/ui/experimental/primitives';

export default function ExperimentalAdminDashboardPage() {
  const { allHomework, allUsers, learningContent, allProgress, analytics, refreshData } = useData();
  const studentAnalytics = useMemo(
    () => (analytics || []).filter((a) => !isAdminEmail(a.email)),
    [analytics]
  );
  const [activeModal, setActiveModal] = useState<'homework' | 'content' | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics'>('dashboard');
  const [isFixingSheets, setIsFixingSheets] = useState(false);

  const metrics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      totalUsers: allUsers.length,
      activeTasks: allHomework.filter((hw) => hw.my_status !== 'done').length,
      totalContent: learningContent.length,
      upcomingDeadlines: allHomework.filter((hw) => {
        const deadline = new Date(hw.deadline);
        return deadline >= today && deadline <= next7Days;
      }).length,
      recentActivity: allProgress.slice(-8).reverse(),
    };
  }, [allHomework, allUsers, learningContent, allProgress]);

  const handleFixSheets = async () => {
    if (!window.confirm('Synchronize Google Sheets headers with the database schema?')) return;
    setIsFixingSheets(true);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'fixSheetHeaders' }),
      });
      const data = await res.json();
      alert(data.success ? 'Sheets updated:\n' + data.data.join('\n') : 'Error: ' + data.error);
    } catch (e: unknown) {
      alert('Failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setIsFixingSheets(false);
    }
  };

  const statCards = [
    { label: 'Students', value: metrics.totalUsers },
    { label: 'Active tasks', value: metrics.activeTasks },
    { label: 'Materials', value: metrics.totalContent },
    { label: 'Due this week', value: metrics.upcomingDeadlines },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Admin overview
        </h1>
        <p style={{ fontSize: 13, color: 'var(--exp-ink-subtle)' }}>
          Monitor activity, create content, and manage the workspace
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Tabs
          tabs={[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'analytics', label: 'Analytics' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as typeof activeTab)}
        />
      </div>

      <AnimatedAdminTabContent tabKey={activeTab}>
      {activeTab === 'dashboard' ? (
        <>
          <div className="exp-admin-grid" style={{ marginBottom: 24 }}>
            {statCards.map((stat) => (
              <motion.div
                key={stat.label}
                className="exp-stat-card exp-stat-card--animated"
                whileHover={{ y: -2, transition: { duration: 0.15 } }}
              >
                <div className="exp-stat-card__label">{stat.label}</div>
                <div className="exp-stat-card__value">{stat.value}</div>
              </motion.div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
            <Card>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Quick create</h3>
              <AdminQuickCreate onCreateHomework={() => setActiveModal('homework')} onCreateContent={() => setActiveModal('content')} />
            </Card>
            <Card>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>System</h3>
              <p style={{ fontSize: 13, color: 'var(--exp-ink-subtle)', marginBottom: 12 }}>
                Repair sheet headers if data columns are out of sync.
              </p>
              <Button variant="secondary" size="sm" onClick={handleFixSheets} disabled={isFixingSheets}>
                {isFixingSheets ? 'Fixing…' : 'Fix sheet headers'}
              </Button>
            </Card>
          </div>

          <Card>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Recent activity</h3>
            <div className="exp-table-wrap">
              <table className="exp-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Task</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentActivity.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--exp-ink-subtle)' }}>No recent activity</td></tr>
                  ) : (
                    metrics.recentActivity.map((p, i) => {
                      const hw = allHomework.find((h) => String(h.id) === String(p.homework_id));
                      const u = allUsers.find((usr) => usr.email === p.email);
                      return (
                        <tr key={i}>
                          <td>{u?.name || p.email}</td>
                          <td>{hw?.title || p.homework_id}</td>
                          <td><Badge color={p.status === 'done' ? 'var(--exp-success)' : undefined}>{p.status}</Badge></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <ExperimentalAdminAnalyticsPanel analytics={studentAnalytics} />
      )}
      </AnimatedAdminTabContent>

      {activeModal === 'homework' && <CreateHomeworkModal onClose={() => setActiveModal(null)} onRefresh={refreshData} />}
      {activeModal === 'content' && <CreateContentModal onClose={() => setActiveModal(null)} onRefresh={refreshData} />}
    </div>
  );
}
