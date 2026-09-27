import { Link } from 'react-router-dom';
import { useActivity } from '../lib/queries.js';
import { PageHead } from '../layout/Shell.js';
import { Card, EmptyState, Timeline, Well } from '../ui/kit.js';
import { actionWords, withTime } from '../lib/format.js';
import { ApiError } from '../lib/api.js';
import s from './pages.module.css';

export function ActivityPage() {
  const activity = useActivity();
  const entries = activity.data ?? [];

  const byDay = new Map<string, typeof entries>();
  for (const entry of entries) {
    const day = new Date(entry.createdAt).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const bucket = byDay.get(day) ?? [];
    bucket.push(entry);
    byDay.set(day, bucket);
  }

  return (
    <>
      <PageHead title="Activity" subtitle="Everything Rig has done, newest first." />

      {activity.isError ? (
        <Well className={s.errorWell}>
          {activity.error instanceof ApiError ? activity.error.message : 'Could not load the activity feed.'}
        </Well>
      ) : null}

      {entries.length === 0 && !activity.isPending ? (
        <Card>
          <EmptyState
            title="Nothing has happened yet"
            text="Deploys, restarts and anything Rig notices while checking against Docker will show up here."
          />
        </Card>
      ) : null}

      {[...byDay.entries()].map(([day, group]) => (
        <div className={s.activityGroup} key={day}>
          <span className={s.activityDay}>{day}</span>
          <Card>
            <Timeline
              entries={group.map((entry) => ({
                key: entry.id,
                title: (
                  <>
                    {actionWords(entry.action)}
                    {entry.appName ? (
                      <>
                        {' '}
                        {entry.appId ? (
                          <Link to={`/apps/${entry.appId}`} style={{ color: 'var(--accent)' }}>
                            {entry.appName}
                          </Link>
                        ) : (
                          entry.appName
                        )}
                      </>
                    ) : null}
                  </>
                ),
                detail: withTime(entry.message, entry.createdAt),
                color: entry.status === 'error' ? 'var(--stop)' : 'var(--accent)',
                state: 'done',
              }))}
            />
          </Card>
        </div>
      ))}
    </>
  );
}
