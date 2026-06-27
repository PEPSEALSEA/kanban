'use client';

import React from 'react';
import AttachmentList from '@/components/AttachmentList';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { Badge, Button, Dialog, Textarea } from '@/components/ui/experimental/primitives';
import { getSubjectColor, useKanbanHome } from '@/hooks/kanban/useKanbanHome';

type KanbanState = ReturnType<typeof useKanbanHome>;

export default function HomeworkDetailDialog({ kanban }: { kanban: KanbanState }) {
  const hw = kanban.activeHomework;
  if (!hw) return null;

  const subjectColor = getSubjectColor(hw.subject, kanban.subjects);
  const myStatus = kanban.homeworkWithStatus.find((h) => h.id === hw.id)?.my_status;
  const finishedUsers = kanban.getFinishedUsers(hw.id);

  return (
    <Dialog open onClose={kanban.closeHomework} size="xl">
      <div className="exp-dialog__header" style={{ padding: '20px 24px 0' }}>
        <div style={{ flex: 1 }}>
          <Badge color={subjectColor}>{hw.subject}</Badge>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: '-0.03em',
              marginTop: 12,
              marginBottom: 8,
              lineHeight: 1.25,
            }}
          >
            {hw.title}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--exp-ink-subtle)', fontFamily: 'var(--exp-mono)' }}>
            Due {new Date(hw.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={kanban.closeHomework} aria-label="Close">
          ✕
        </Button>
      </div>

      <div className="exp-dialog__body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          <section>
            <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--exp-ink-subtle)', marginBottom: 12 }}>
              Instructions
            </h3>
            <div style={{ marginBottom: 16 }}>
              <AttachmentList
                contentId={hw.id}
                contentType="homework"
                attachments={kanban.memoizedHomeworkAttachments}
              />
            </div>
            <div
              style={{
                padding: 16,
                background: 'var(--exp-surface-2)',
                borderRadius: 12,
                border: '1px solid var(--exp-hairline)',
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--exp-ink-muted)',
              }}
            >
              <MarkdownRenderer content={hw.description || ''} />
            </div>
          </section>

          <section>
            <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--exp-ink-subtle)', marginBottom: 12 }}>
              Submissions
            </h3>

            {kanban.user && (
              <div
                style={{
                  padding: 16,
                  background: 'var(--exp-surface-2)',
                  border: '1px solid var(--exp-hairline)',
                  borderRadius: 12,
                  marginBottom: 16,
                }}
              >
                <Textarea
                  placeholder="What did you learn today?"
                  value={kanban.shareText}
                  onChange={(e) => kanban.setShareText(e.target.value)}
                  style={{ minHeight: 80, marginBottom: 12 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Button variant="ghost" size="sm" onClick={(e) => kanban.uploadOrReplaceProof(e, hw.id)}>
                    Add photo
                  </Button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => kanban.toggleComplete(e, hw.id, myStatus)}
                    >
                      {myStatus === 'done' ? 'Mark pending' : 'Mark finished'}
                    </Button>
                    <Button variant="primary" size="sm" onClick={kanban.handleShareSubmission}>
                      Post
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 360, overflowY: 'auto' }}>
              {finishedUsers.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--exp-ink-tertiary)', fontSize: 13 }}>
                  No submissions yet
                </div>
              ) : (
                finishedUsers.map((student, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                      background: 'var(--exp-surface-2)',
                      border: '1px solid var(--exp-hairline)',
                      borderRadius: 12,
                    }}
                  >
                    <img
                      src={student.picture}
                      alt=""
                      style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--exp-hairline)' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{student.name}</span>
                        <Badge color="var(--exp-success)">Done</Badge>
                      </div>
                      {student.proof &&
                        student.proof.split(',').map((url, idx) =>
                          url.startsWith('http') ? (
                            <img
                              key={idx}
                              src={url}
                              alt=""
                              style={{ width: '100%', borderRadius: 8, marginTop: 8, border: '1px solid var(--exp-hairline)' }}
                            />
                          ) : (
                            <p key={idx} style={{ fontSize: 13, color: 'var(--exp-ink-muted)', fontStyle: 'italic', marginTop: 8 }}>
                              {url}
                            </p>
                          )
                        )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </Dialog>
  );
}
