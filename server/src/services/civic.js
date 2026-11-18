import { db } from '../db/index.js';

export const SLA_HOURS = {
  Pothole: 72,
  Streetlight: 120,
  'Water Leak': 24,
  Garbage: 48,
  Drainage: 48,
  Other: 120
};

export function hoursBetween(start, end = new Date()) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3600000);
}

export function issueMetrics(issue) {
  const acknowledged = issue.acknowledged_at ? hoursBetween(issue.created_at, issue.acknowledged_at) : null;
  const resolved = issue.resolved_at ? hoursBetween(issue.created_at, issue.resolved_at) : null;
  const age = hoursBetween(issue.created_at);
  const sla = SLA_HOURS[issue.category] || 120;
  let slaState;
  if (issue.status === 'Resolved') slaState = resolved <= sla ? 'within' : 'overdue';
  else if (issue.status === 'Rejected') slaState = 'within';
  else slaState = age > sla ? 'overdue' : age > sla * 0.75 ? 'near' : 'within';
  return {
    slaHours: sla,
    ageHours: age,
    acknowledgeHours: acknowledged,
    resolveHours: resolved,
    slaState
  };
}

export function award(userId, issueId, action, points, period = '') {
  db.prepare('INSERT OR IGNORE INTO point_ledger (user_id, issue_id, action, points, period) VALUES (?,?,?,?,?)')
    .run(userId, issueId, action, points, period);
}

export function nearestWard(latitude, longitude) {
  return db.prepare(`
    SELECT id, name, latitude, longitude,
      ((latitude - ?) * (latitude - ?) + (longitude - ?) * (longitude - ?)) AS distance
    FROM wards ORDER BY distance LIMIT 1
  `).get(latitude, latitude, longitude, longitude);
}

export function statusNotification(issue, status, io) {
  const targets = new Set([issue.reporter_id]);
  db.prepare('SELECT user_id FROM upvotes WHERE issue_id = ?').all(issue.id).forEach(({ user_id }) => targets.add(user_id));
  db.prepare('SELECT user_id FROM monthly_votes WHERE issue_id = ?').all(issue.id).forEach(({ user_id }) => targets.add(user_id));
  const insert = db.prepare('INSERT INTO notifications (user_id, issue_id, message) VALUES (?,?,?)');
  for (const userId of targets) {
    const result = insert.run(userId, issue.id, `${issue.title} is now ${status}.`);
    io.to(`user:${userId}`).emit('notification', {
      id: Number(result.lastInsertRowid),
      issue_id: issue.id,
      message: `${issue.title} is now ${status}.`,
      is_read: 0,
      created_at: new Date().toISOString()
    });
  }
}
