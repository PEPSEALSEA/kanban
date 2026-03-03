'use client';

import React, { useState, useEffect } from 'react';

type Task = {
  id: string;
  title: string;
  description: string;
  tag: string;
  tagColor: string;
  user: string;
};

type ColumnType = 'todo' | 'in-progress' | 'done';

const INITIAL_TASKS: Record<ColumnType, Task[]> = {
  todo: [
    { id: '1', title: 'Design System Update', description: 'Update the core tokens for the new dark mode theme.', tag: 'Design', tagColor: '#6366f1', user: 'https://i.pravatar.cc/150?u=1' },
    { id: '2', title: 'API Integration', description: 'Connect the frontend Kanban board to the backup service.', tag: 'Backend', tagColor: '#f59e0b', user: 'https://i.pravatar.cc/150?u=2' },
  ],
  'in-progress': [
    { id: '3', title: 'User Authentication', description: 'Implement OAuth2 with GitHub and Google providers.', tag: 'Security', tagColor: '#ef4444', user: 'https://i.pravatar.cc/150?u=3' },
  ],
  done: [
    { id: '4', title: 'Project Setup', description: 'Initialize Next.js project with TypeScript and SEO.', tag: 'DevOps', tagColor: '#10b981', user: 'https://i.pravatar.cc/150?u=4' },
  ],
};

export default function KanbanBoard() {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [sourceCol, setSourceCol] = useState<ColumnType | null>(null);

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

  const onDrop = (e: React.DragEvent, targetCol: ColumnType) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (!draggedTaskId || !sourceCol || sourceCol === targetCol) return;

    const taskToMove = tasks[sourceCol].find(t => t.id === draggedTaskId);
    if (!taskToMove) return;

    setTasks(prev => {
      const newSourceArr = prev[sourceCol].filter(t => t.id !== draggedTaskId);
      const newTargetArr = [...prev[targetCol], taskToMove];
      return {
        ...prev,
        [sourceCol]: newSourceArr,
        [targetCol]: newTargetArr,
      };
    });

    setDraggedTaskId(null);
    setSourceCol(null);
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '2rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, background: 'linear-gradient(to right, #6366f1, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            FlowBoard
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Organize your workflow with style.</p>
        </div>
        <div className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Status: </span>
            <span style={{ color: '#10b981', fontWeight: 600 }}>● Live </span>
          </div>
          <button className="glass" style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', color: '#fff', cursor: 'pointer', border: 'none', background: 'var(--primary)', fontWeight: 600 }}>
            + Create Task
          </button>
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
                {col === 'todo' && '🎯 To Do'}
                {col === 'in-progress' && '⚡ In Progress'}
                {col === 'done' && '✅ Completed'}
                <span className="badge">{tasks[col].length}</span>
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>•••</button>
            </div>

            <div className="tasks-container">
              {tasks[col].map(task => (
                <div
                  key={task.id}
                  className="card glass"
                  draggable
                  onDragStart={(e) => onDragStart(e, task.id, col)}
                >
                  <span className="card-tag" style={{ backgroundColor: `${task.tagColor}22`, color: task.tagColor, border: `1px solid ${task.tagColor}44` }}>
                    {task.tag}
                  </span>
                  <h4 className="card-title">{task.title}</h4>
                  <p className="card-desc">{task.description}</p>
                  <div className="footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img src={task.user} alt="user" className="avatar" />
                      <span>{task.id === '1' ? 'Alex' : task.id === '2' ? 'Sam' : task.id === '3' ? 'Jordan' : 'Charlie'}</span>
                    </div>
                    <span>Mar 3</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="btn-add">
              + Add Item
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
