'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/ui/experimental/layout/AppShell';
import HomeworkDetailDialog from '@/components/ui/experimental/pages/HomeworkDetailDialog';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  Toast,
} from '@/components/ui/experimental/primitives';
import { useKanbanHome, getSubjectColor, type HomeworkItem } from '@/hooks/kanban/useKanbanHome';
import { formatThaiRelativeDayLabel } from '@/lib/thaiDate';

const COLUMN_DEFS = [
  { key: 'soon' as const, title: 'Due Soon', subtitle: 'Next 3 days' },
  { key: 'week' as const, title: 'This Week', subtitle: '4–7 days' },
  { key: 'backlog' as const, title: 'Upcoming', subtitle: 'Later' },
];

export default function ExperimentalKanbanHomePage() {
  const kanban = useKanbanHome();

  const commandResults = useMemo(() => {
    if (!kanban.searchQuery.trim()) return kanban.homeworkWithStatus.slice(0, 8);
    const q = kanban.searchQuery.toLowerCase();
    return kanban.homeworkWithStatus
      .filter(
        (hw) =>
          hw.title.toLowerCase().includes(q) ||
          hw.subject.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [kanban.homeworkWithStatus, kanban.searchQuery]);

  return (
    <AppShell
      breadcrumb={['StudyFlow', 'Board']}
      actions={
        <Button variant="ghost" size="sm" onClick={() => kanban.setCommandOpen(true)}>
          Search <kbd style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>⌘K</kbd>
        </Button>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }} className="exp-page-header">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 4 }}>
            Homework Board
          </h1>
          <p style={{ fontSize: 13, color: 'var(--exp-ink-subtle)' }}>
            Track assignments, submissions, and deadlines
          </p>
        </div>
        <Tabs
          tabs={[
            { id: 'kanban', label: 'Board' },
            { id: 'calendar', label: 'Calendar' },
            { id: 'timeline', label: 'Timeline' },
          ]}
          active={kanban.viewMode}
          onChange={(id) => kanban.setViewMode(id as typeof kanban.viewMode)}
        />
      </div>

      {kanban.isLoading ? (
        <div style={{ display: 'flex', gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ width: 320, height: 400 }} />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {kanban.viewMode === 'kanban' && (
            <motion.div
              key="kanban"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="exp-kanban"
            >
              {COLUMN_DEFS.map((col) => {
                const items = kanban.columns[col.key];
                return (
                  <div key={col.key} className="exp-kanban-col">
                    <div className="exp-kanban-col__header">
                      <div>
                        <div className="exp-kanban-col__title">{col.title}</div>
                        <div className="exp-kanban-col__subtitle">{col.subtitle}</div>
                      </div>
                      <span className="exp-kanban-col__count">{items.length}</span>
                    </div>
                    <div className="exp-kanban-col__body">
                      {items.length === 0 ? (
                        <EmptyState title="No tasks" description={`Nothing in ${col.title.toLowerCase()}`} />
                      ) : (
                        items.map((hw) => (
                          <TaskCard
                            key={hw.id}
                            hw={hw}
                            subjectColor={getSubjectColor(hw.subject, kanban.subjects)}
                            onOpen={() => kanban.openHomework(hw)}
                            onToggle={(e) => kanban.toggleComplete(e, hw.id, hw.my_status)}
                            showToggle={!!kanban.user}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {kanban.viewMode === 'calendar' && (
            <CalendarView kanban={kanban} />
          )}

          {kanban.viewMode === 'timeline' && (
            <TimelineView kanban={kanban} />
          )}
        </AnimatePresence>
      )}

      <HomeworkDetailDialog kanban={kanban} />

      {kanban.uploadQueue.length > 0 && (
        <Dialog
          open
          onClose={() => kanban.uploadQueue.every((f) => f.status !== 'uploading') && kanban.setUploadQueue([])}
          title="Uploading proof"
          footer={
            kanban.uploadQueue.every((f) => f.status !== 'uploading') ? (
              <Button onClick={() => kanban.setUploadQueue([])}>Close</Button>
            ) : undefined
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {kanban.uploadQueue.map((f) => (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'var(--exp-surface-2)',
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <span>{f.name}</span>
                <span>{f.status === 'uploading' ? '…' : f.status === 'done' ? '✓' : '✕'}</span>
              </div>
            ))}
          </div>
        </Dialog>
      )}

      {kanban.confirmModal && (
        <Dialog
          open
          onClose={() => kanban.setConfirmModal(null)}
          title={kanban.confirmModal.title}
          footer={
            <>
              <Button variant="ghost" onClick={() => kanban.setConfirmModal(null)}>
                Cancel
              </Button>
              <Button
                variant={kanban.confirmModal.isDanger ? 'danger' : 'primary'}
                onClick={kanban.confirmModal.onConfirm}
              >
                Confirm
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--exp-ink-muted)', fontSize: 14 }}>{kanban.confirmModal.message}</p>
        </Dialog>
      )}

      {kanban.commandOpen && (
        <div className="exp-command-overlay" onClick={() => kanban.setCommandOpen(false)}>
          <div className="exp-command" onClick={(e) => e.stopPropagation()}>
            <input
              className="exp-command__input"
              placeholder="Search homework…"
              value={kanban.searchQuery}
              onChange={(e) => kanban.setSearchQuery(e.target.value)}
              autoFocus
            />
            <div className="exp-command__list">
              {commandResults.map((hw) => (
                <button
                  key={hw.id}
                  type="button"
                  className="exp-command__item"
                  onClick={() => {
                    kanban.openHomework(hw);
                    kanban.setCommandOpen(false);
                    kanban.setSearchQuery('');
                  }}
                >
                  <Badge color={getSubjectColor(hw.subject, kanban.subjects)}>{hw.subject}</Badge>
                  <span>{hw.title}</span>
                </button>
              ))}
              {commandResults.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--exp-ink-subtle)', fontSize: 13 }}>
                  No results
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {kanban.notification && <Toast message={kanban.notification.message} type={kanban.notification.type} />}
    </AppShell>
  );
}

function TaskCard({
  hw,
  subjectColor,
  onOpen,
  onToggle,
  showToggle,
}: {
  hw: HomeworkItem;
  subjectColor: string;
  onOpen: () => void;
  onToggle: (e: React.MouseEvent) => void;
  showToggle: boolean;
}) {
  const isDone = hw.my_status === 'done';
  return (
    <motion.div
      className={`exp-task-card ${isDone ? 'exp-task-card--done' : ''}`}
      onClick={onOpen}
      layout
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
    >
      <Badge color={subjectColor}>{hw.subject}</Badge>
      <div className={`exp-task-card__title ${isDone ? 'exp-task-card__title--done' : ''}`}>{hw.title}</div>
      <div className="exp-task-card__meta">
        <span className="exp-task-card__date">
          {new Date(hw.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
        </span>
        {showToggle && (
          <button
            type="button"
            className={`exp-check ${isDone ? 'exp-check--done' : ''}`}
            onClick={onToggle}
            aria-label={isDone ? 'Mark pending' : 'Mark done'}
          >
            {isDone && '✓'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function CalendarView({ kanban }: { kanban: ReturnType<typeof useKanbanHome> }) {
  const year = kanban.focusDate.getFullYear();
  const month = kanban.focusDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: { day: number; month: number; year: number; current: boolean }[] = [];
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, month: month - 1, year, current: false });
  for (let i = 1; i <= totalDays; i++) cells.push({ day: i, month, year, current: true });
  while (cells.length < 42) cells.push({ day: cells.length - totalDays - firstDay + 1, month: month + 1, year, current: false });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>
          {kanban.focusDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => kanban.setFocusDate(new Date(year, month - 1, 1))}
          >
            ←
          </Button>
          <Button variant="ghost" size="sm" onClick={() => kanban.setFocusDate(new Date())}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => kanban.setFocusDate(new Date(year, month + 1, 1))}
          >
            →
          </Button>
        </div>
      </div>
      <div className="exp-calendar">
        <div className="exp-calendar__head">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="exp-calendar__head-cell">{d}</div>
          ))}
        </div>
        <div className="exp-calendar__grid">
          {cells.map((d, i) => {
            const isToday = new Date().toDateString() === new Date(d.year, d.month, d.day).toDateString();
            const dayTasks = kanban.homeworkWithStatus.filter((hw) => {
              const hwDate = new Date(hw.deadline);
              return hwDate.getDate() === d.day && hwDate.getMonth() === d.month && hwDate.getFullYear() === d.year;
            });
            const hasTasks = dayTasks.length > 0;
            return (
              <div
                key={i}
                className={`exp-calendar__day ${!d.current ? 'exp-calendar__day--muted' : ''} ${isToday ? 'exp-calendar__day--today' : ''} ${hasTasks ? 'exp-calendar__day--clickable' : ''}`}
                onClick={() => hasTasks && kanban.setSelectedDate(new Date(d.year, d.month, d.day).toISOString())}
              >
                <div className="exp-calendar__day-num">{d.day}</div>
                <div className="exp-calendar__dots">
                  {dayTasks.slice(0, 5).map((task) => (
                    <span
                      key={task.id}
                      className="exp-calendar__dot"
                      style={{
                        background: getSubjectColor(task.subject, kanban.subjects),
                        opacity: task.my_status === 'done' ? 0.35 : 1,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={!!kanban.selectedDate}
        onClose={() => kanban.setSelectedDate(null)}
        title={
          kanban.selectedDate
            ? new Date(kanban.selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })
            : ''
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {kanban.homeworkWithStatus
            .filter((hw) => {
              if (!kanban.selectedDate) return false;
              const hwDate = new Date(hw.deadline);
              const sDate = new Date(kanban.selectedDate);
              return (
                hwDate.getDate() === sDate.getDate() &&
                hwDate.getMonth() === sDate.getMonth() &&
                hwDate.getFullYear() === sDate.getFullYear()
              );
            })
            .map((task) => (
              <button
                key={task.id}
                type="button"
                className="exp-task-card"
                style={{ textAlign: 'left', width: '100%' }}
                onClick={() => {
                  kanban.openHomework(task);
                  kanban.setSelectedDate(null);
                }}
              >
                <Badge color={getSubjectColor(task.subject, kanban.subjects)}>{task.subject}</Badge>
                <div className="exp-task-card__title">{task.title}</div>
              </button>
            ))}
        </div>
      </Dialog>
    </motion.div>
  );
}

function TimelineView({ kanban }: { kanban: ReturnType<typeof useKanbanHome> }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const d = new Date(kanban.focusDate);
            d.setDate(d.getDate() - 7);
            kanban.setFocusDate(d);
          }}
        >
          ←
        </Button>
        <span style={{ fontSize: 14, fontWeight: 500 }}>
          Week of {kanban.focusDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const d = new Date(kanban.focusDate);
            d.setDate(d.getDate() + 7);
            kanban.setFocusDate(d);
          }}
        >
          →
        </Button>
        <Button variant="ghost" size="sm" onClick={() => kanban.setFocusDate(new Date())}>
          Today
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {Array.from({ length: 30 }).map((_, i) => {
          const d = new Date(kanban.focusDate);
          d.setDate(d.getDate() + i);
          const isToday = new Date().toDateString() === d.toDateString();
          const dayTasks = kanban.homeworkWithStatus.filter((hw) => {
            const hwDate = new Date(hw.deadline);
            return (
              hwDate.getDate() === d.getDate() &&
              hwDate.getMonth() === d.getMonth() &&
              hwDate.getFullYear() === d.getFullYear()
            );
          });

          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr',
                gap: 16,
                padding: '16px 0',
                borderBottom: '1px solid var(--exp-hairline)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    fontFamily: 'var(--exp-mono)',
                    color: isToday ? 'var(--exp-primary)' : 'var(--exp-ink-muted)',
                  }}
                >
                  {d.getDate()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--exp-ink-tertiary)', textTransform: 'uppercase' }}>
                  {d.toLocaleDateString('th-TH', { month: 'short' })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--exp-ink-subtle)', marginTop: 4 }}>
                  {formatThaiRelativeDayLabel(d)}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {dayTasks.length === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--exp-ink-tertiary)', fontStyle: 'italic' }}>
                    No tasks due
                  </span>
                ) : (
                  dayTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="exp-task-card"
                      style={{ flex: '1 1 240px', maxWidth: 320, textAlign: 'left' }}
                      onClick={() => kanban.openHomework(task)}
                    >
                      <Badge color={getSubjectColor(task.subject, kanban.subjects)}>{task.subject}</Badge>
                      <div
                        className={`exp-task-card__title ${task.my_status === 'done' ? 'exp-task-card__title--done' : ''}`}
                      >
                        {task.title}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
