'use client';

import React, { useMemo } from 'react';
import { Homework, UserInfo, ProgressItem } from '@/types';

interface Props {
  user: UserInfo | null;
  homeworkWithStatus: Homework[];
  viewMode: 'kanban' | 'calendar' | 'timeline';
  setViewMode: (mode: 'kanban' | 'calendar' | 'timeline') => void;
  focusDate: Date;
  setFocusDate: (date: Date) => void;
  setActiveHomework: (hw: Homework) => void;
  toggleComplete: (e: React.MouseEvent, hwId: string, currentStatus?: string) => void;
  getSubjectColor: (subject: string) => string;
}

export function KanbanDesktopView({
  user,
  homeworkWithStatus,
  viewMode,
  setViewMode,
  focusDate,
  setFocusDate,
  setActiveHomework,
  toggleComplete,
  getSubjectColor
}: Props) {

  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const categorized = { soon: [] as Homework[], week: [] as Homework[], backlog: [] as Homework[] };
    
    homeworkWithStatus.forEach(hw => {
      const deadline = new Date(hw.deadline);
      const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 3) categorized.soon.push(hw);
      else if (diffDays <= 7) categorized.week.push(hw);
      else categorized.backlog.push(hw);
    });

    const sortFn = (a: Homework, b: Homework) => (a.my_status === 'done' ? 1 : 0) - (b.my_status === 'done' ? 1 : 0);
    return { 
      soon: categorized.soon.sort(sortFn), 
      week: categorized.week.sort(sortFn), 
      backlog: categorized.backlog.sort(sortFn) 
    };
  }, [homeworkWithStatus]);

  return (
    <>
      {/* View Switcher Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem', marginBottom: '1rem', padding: '0 1rem' }}>
        <div className="glass" style={{ display: 'flex', padding: '4px', borderRadius: '14px', gap: '4px' }}>
          {(['kanban', 'calendar', 'timeline'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`view-switcher-btn ${viewMode === mode ? 'active' : ''}`}
            >
              {mode === 'kanban' && '📋'}
              {mode === 'calendar' && '📅'}
              {mode === 'timeline' && '⏳'}
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar/Timeline Navigation Controls */}
      {(viewMode === 'calendar' || viewMode === 'timeline') && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
          <button 
            onClick={() => {
              const d = new Date(focusDate);
              if (viewMode === 'calendar') d.setMonth(d.getMonth() - 1);
              else d.setDate(d.getDate() - 7);
              setFocusDate(d);
            }}
            className="glass"
            style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', color: '#fff', cursor: 'pointer' }}
          >←</button>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, minWidth: '180px', textAlign: 'center' }}>
            {viewMode === 'calendar' 
              ? focusDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
              : `Week of ${new Date(focusDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`
            }
          </h2>
          <button 
            onClick={() => {
              const d = new Date(focusDate);
              if (viewMode === 'calendar') d.setMonth(d.getMonth() + 1);
              else d.setDate(d.getDate() + 7);
              setFocusDate(d);
            }}
            className="glass"
            style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', color: '#fff', cursor: 'pointer' }}
          >→</button>
          <button 
            onClick={() => setFocusDate(new Date())}
            className="glass"
            style={{ padding: '0.5rem 1rem', borderRadius: '1rem', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
          >Today</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {viewMode === 'kanban' && (
          <div className="kanban-container" style={{ padding: '1rem 2.5rem 2.5rem', display: 'flex', flexDirection: 'row', gap: '2rem', overflowX: 'auto' }}>
            {[
              { key: 'soon', title: '🔥 3 วันก่อนส่ง', items: columns.soon, color: '#f43f5e' },
              { key: 'week', title: '📅 7 วันก่อนส่ง', items: columns.week, color: '#f59e0b' },
              { key: 'backlog', title: '🐚 งานดองเค็ม', items: columns.backlog, color: '#6366f1' }
            ].map(col => (
              <div key={col.key} className="column glass" style={{ minWidth: '360px', borderTop: `4px solid ${col.color}`, padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{col.title}</h3>
                  <span className="badge">{col.items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {col.items.map(hw => {
                    const isDone = hw.my_status === 'done';
                    return (
                      <div key={hw.id} className="card glass" onClick={() => setActiveHomework(hw)} style={{ opacity: isDone ? 0.5 : 1, borderLeft: `6px solid ${isDone ? '#10b981' : getSubjectColor(hw.subject)}`, padding: '1.25rem', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: getSubjectColor(hw.subject), textTransform: 'uppercase' }}>{hw.subject}</span>
                            <h4 style={{ margin: '4px 0', textDecoration: isDone ? 'line-through' : 'none' }}>{hw.title}</h4>
                          </div>
                          {user && (
                            <div onClick={(e) => { e.stopPropagation(); toggleComplete(e, hw.id, hw.my_status); }} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '2px solid var(--primary)', background: isDone ? 'var(--primary)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isDone && <span style={{ color: '#fff', fontWeight: 900 }}>✓</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'calendar' && (
          <div style={{ padding: '0 2.5rem 2.5rem' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, 1fr)', 
              gap: '1px', 
              background: 'var(--card-border)', 
              borderRadius: '1.5rem', 
              overflow: 'hidden',
              border: '1px solid var(--card-border)'
            }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)' }}>{d}</div>
              ))}
              {(() => {
                const year = focusDate.getFullYear();
                const month = focusDate.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const totalDays = new Date(year, month + 1, 0).getDate();
                const cells = [];
                const prevMonthDays = new Date(year, month, 0).getDate();
                
                for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, month: month - 1, year, current: false });
                for (let i = 1; i <= totalDays; i++) cells.push({ day: i, month, year, current: true });
                while (cells.length < 42) cells.push({ day: cells.length - totalDays - firstDay + 1, month: month + 1, year, current: false });
                
                return cells.map((d, i) => {
                  const isToday = new Date().toDateString() === new Date(d.year, d.month, d.day).toDateString();
                  const dayTasks = homeworkWithStatus.filter(hw => {
                    const hwDate = new Date(hw.deadline);
                    return hwDate.getDate() === d.day && hwDate.getMonth() === d.month && hwDate.getFullYear() === d.year;
                  });
                  
                  return (
                    <div 
                      key={i} 
                      className={`calendar-day ${!d.current ? 'not-current' : ''} ${isToday ? 'today' : ''}`}
                      style={{ 
                        opacity: d.current ? 1 : 0.4,
                        display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto'
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: d.current ? 700 : 400 }}>{d.day}</span>
                      {dayTasks.map(task => (
                        <div 
                          key={task.id} 
                          onClick={() => setActiveHomework(task)}
                          style={{ 
                            fontSize: '0.65rem', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: `${getSubjectColor(task.subject)}30`, 
                            color: getSubjectColor(task.subject), 
                            borderLeft: `2px solid ${getSubjectColor(task.subject)}`,
                            whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', cursor: 'pointer',
                            textDecoration: task.my_status === 'done' ? 'line-through' : 'none'
                          }}>
                          {task.title}
                        </div>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {viewMode === 'timeline' && (
          <div style={{ padding: '0 1rem 2.5rem' }}>
            <div className="timeline-v-container">
              {Array.from({ length: 30 }).map((_, i) => {
                const d = new Date(focusDate);
                d.setDate(d.getDate() + i); 
                const isToday = new Date().toDateString() === d.toDateString();
                
                const dayTasks = homeworkWithStatus
                  .filter(hw => {
                    const hwDate = new Date(hw.deadline);
                    return hwDate.getDate() === d.getDate() && 
                           hwDate.getMonth() === d.getMonth() && 
                           hwDate.getFullYear() === d.getFullYear();
                  })
                  .sort((a, b) => {
                    if (a.my_status === 'done' && b.my_status !== 'done') return 1;
                    if (a.my_status !== 'done' && b.my_status === 'done') return -1;
                    return 0;
                  });

                return (
                  <div key={i} className="timeline-v-item">
                    <div className="timeline-v-left">
                      <div className="timeline-v-date">
                        <div className="timeline-v-date-day" style={{ color: isToday ? 'var(--primary)' : 'inherit' }}>
                          {d.getDate()}
                        </div>
                        <div className="timeline-v-date-month">
                          {d.toLocaleDateString('th-TH', { month: 'short' })}
                        </div>
                      </div>
                      <div className="timeline-v-path">
                        <div className={`timeline-v-dot ${isToday ? 'active' : ''}`} style={{ background: isToday ? 'var(--primary)' : 'rgba(255,255,255,0.2)', boxShadow: isToday ? '0 0 15px var(--primary)' : 'none' }} />
                      </div>
                    </div>

                    <div className="timeline-v-right">
                      {dayTasks.length > 0 ? (
                        <div className="timeline-v-cards">
                          {dayTasks.map(task => {
                            const isDone = task.my_status === 'done';
                            return (
                              <div 
                                key={task.id} 
                                onClick={() => setActiveHomework(task)}
                                className={`timeline-card-v ${isDone ? 'done' : ''}`}
                                style={{ 
                                  borderLeft: `6px solid ${isDone ? '#10b981' : getSubjectColor(task.subject)}`,
                                }}
                              >
                                <div className="timeline-card-v-subject" style={{ color: getSubjectColor(task.subject) }}>
                                  {task.subject}
                                </div>
                                <div className="timeline-card-v-title" style={{ textDecoration: isDone ? 'line-through' : 'none' }}>
                                  {task.title}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.8rem', fontStyle: 'italic', padding: '10px 0' }}>
                          No tasks due
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
