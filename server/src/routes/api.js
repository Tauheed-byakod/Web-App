import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, uploadDir } from '../db/index.js';
import { allow, authenticate, optionalAuthenticate, signToken } from '../middleware/auth.js';
import { fail } from '../middleware/errors.js';
import { award, hoursBetween, issueMetrics, nearestWard, SLA_HOURS, statusNotification } from '../services/civic.js';

export const router = Router();
const categories = ['Pothole', 'Streetlight', 'Water Leak', 'Garbage', 'Drainage', 'Other'];
const statuses = ['Reported', 'Acknowledged', 'In Progress', 'Resolved', 'Rejected'];
const transitions = {
  Reported: ['Acknowledged', 'Rejected'],
  Acknowledged: ['In Progress', 'Rejected'],
  'In Progress': ['Resolved', 'Rejected']
};
const positiveId = value => z.coerce.number().int().positive().parse(value);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype)) {
      return cb(fail(400, 'INVALID_FILE', 'Upload a JPEG, PNG, WebP or SVG image.'));
    }
    cb(null, true);
  }
});
const parse = (schema, value) => schema.parse(value);
const userById = (id) => db.prepare('SELECT id,name,email,role,department_id,created_at FROM users WHERE id=?').get(id);

router.post('/auth/register', (req, res) => {
  const input = parse(z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(160),
    password: z.string().min(6).max(100)
  }), req.body);
  const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(input.email);
  if (existing) throw fail(409, 'EMAIL_IN_USE', 'An account with that email already exists.');
  const info = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,"citizen")')
    .run(input.name, input.email, bcrypt.hashSync(input.password, 10));
  const user = userById(info.lastInsertRowid);
  res.status(201).json({ user, token: signToken(user) });
});

router.post('/auth/login', (req, res) => {
  const input = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(input.email);
  if (!user || !bcrypt.compareSync(input.password, user.password_hash)) throw fail(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  res.json({ user: userById(user.id), token: signToken(user) });
});

router.get('/auth/me', authenticate, (req, res) => res.json({ user: userById(req.auth.id) }));
router.get('/meta', (_req, res) => res.json({
  categories, statuses, slaHours: SLA_HOURS,
  wards: db.prepare('SELECT * FROM wards ORDER BY id').all(),
  departments: db.prepare('SELECT * FROM departments ORDER BY id').all()
}));

const issueSelect = `
  SELECT i.*, u.name AS reporter_name, d.name AS department_name, w.name AS ward_name,
    (SELECT COUNT(*) FROM upvotes v WHERE v.issue_id=i.id) AS upvotes,
    (SELECT COUNT(*) FROM monthly_votes mv WHERE mv.issue_id=i.id AND mv.month=?) AS month_votes
  FROM issues i JOIN users u ON u.id=i.reporter_id
  LEFT JOIN departments d ON d.id=i.department_id LEFT JOIN wards w ON w.id=i.ward_id
`;
router.get('/issues', (req, res) => {
  const filters = parse(z.object({
    category: z.enum(categories).optional(),
    status: z.enum(statuses).optional(),
    wardId: z.coerce.number().int().positive().optional(),
    q: z.string().max(120).optional(),
    mine: z.enum(['true','false']).optional(),
    overdue: z.enum(['true','false']).optional(),
    limit: z.coerce.number().int().min(1).max(300).default(150)
  }), req.query);
  const clauses = [];
  const args = [new Date().toISOString().slice(0, 7)];
  if (filters.category) { clauses.push('i.category=?'); args.push(filters.category); }
  if (filters.status) { clauses.push('i.status=?'); args.push(filters.status); }
  if (filters.wardId) { clauses.push('i.ward_id=?'); args.push(filters.wardId); }
  if (filters.q) { clauses.push('(i.title LIKE ? OR i.description LIKE ?)'); args.push(`%${filters.q}%`, `%${filters.q}%`); }
  if (filters.mine === 'true') {
    if (!req.headers.authorization) throw fail(401, 'AUTH_REQUIRED', 'Sign in to view your reports.');
    const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
    let uid;
    try { uid = jwt.verify(token, process.env.JWT_SECRET || 'local-demo-only-change-this-secret').id; }
    catch { throw fail(401, 'SESSION_EXPIRED', 'Your session has expired.'); }
    clauses.push('i.reporter_id=?'); args.push(uid);
  }
  const rows = db.prepare(`${issueSelect} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY i.created_at DESC LIMIT ?`)
    .all(...args, filters.limit);
  const issues = rows.map(issue => ({ ...issue, ...issueMetrics(issue) }))
    .filter(issue => filters.overdue !== 'true' || issue.slaState === 'overdue');
  res.json({ issues });
});

router.get('/issues/nearby', (req, res) => {
  const input = parse(z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    category: z.enum(categories)
  }), req.query);
  const candidates = db.prepare(`SELECT id,title,status,latitude,longitude,created_at FROM issues
    WHERE category=? AND status NOT IN ('Resolved','Rejected')`).all(input.category);
  const nearby = candidates.map(issue => {
    const r = Math.PI / 180;
    const dLat = (issue.latitude - input.latitude) * r;
    const dLon = (issue.longitude - input.longitude) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(input.latitude * r) * Math.cos(issue.latitude * r) * Math.sin(dLon / 2) ** 2;
    return { ...issue, distanceMeters: Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) };
  }).filter(issue => issue.distanceMeters <= 100).sort((a,b) => a.distanceMeters - b.distanceMeters);
  res.json({ issues: nearby });
});

router.post('/issues', authenticate, allow('citizen'), upload.single('photo'), (req, res) => {
  const input = parse(z.object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(15).max(2000),
    category: z.enum(categories),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180)
  }), req.body);
  const ward = nearestWard(input.latitude, input.longitude);
  const departmentMap = { Pothole: 'Roads', Streetlight: 'Electricity', 'Water Leak': 'Water Supply', Garbage: 'Sanitation', Drainage: 'Drainage', Other: 'Roads' };
  const department = db.prepare('SELECT id FROM departments WHERE name=?').get(departmentMap[input.category]);
  const tx = db.transaction(() => {
    const created = db.prepare(`INSERT INTO issues (reporter_id,title,description,category,photo_path,latitude,longitude,department_id,ward_id)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.auth.id, input.title, input.description, input.category,
      req.file ? `/uploads/${req.file.filename}` : null, input.latitude, input.longitude, department?.id || null, ward?.id || null);
    db.prepare('INSERT INTO issue_events (issue_id,actor_id,new_status,note) VALUES (?,?,?,?)')
      .run(created.lastInsertRowid, req.auth.id, 'Reported', 'Report submitted by a resident');
    award(req.auth.id, Number(created.lastInsertRowid), 'report', 10);
    return created.lastInsertRowid;
  });
  const id = tx();
  res.status(201).json({ issue: db.prepare('SELECT * FROM issues WHERE id=?').get(id) });
});

router.get('/issues/:id', optionalAuthenticate, (req, res) => {
  const id = positiveId(req.params.id);
  const issue = db.prepare(`${issueSelect} WHERE i.id=?`).get(new Date().toISOString().slice(0,7), id);
  if (!issue) throw fail(404, 'ISSUE_NOT_FOUND', 'This report could not be found.');
  const events = db.prepare(`SELECT e.*,u.name AS actor_name FROM issue_events e
    LEFT JOIN users u ON u.id=e.actor_id WHERE issue_id=? ORDER BY created_at`).all(id);
  const comments = db.prepare(`SELECT c.*,u.name AS user_name,u.role FROM comments c JOIN users u ON u.id=c.user_id
    WHERE issue_id=? ORDER BY c.created_at`).all(id);
  const month = new Date().toISOString().slice(0,7);
  const viewerUpvoted = req.auth ? Boolean(db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND issue_id=?').get(req.auth.id,id)) : false;
  const viewerVoted = req.auth ? Boolean(db.prepare('SELECT 1 FROM monthly_votes WHERE user_id=? AND issue_id=? AND month=?').get(req.auth.id,id,month)) : false;
  res.json({ issue: { ...issue, ...issueMetrics(issue), viewerUpvoted, viewerVoted }, events, comments });
});

router.post('/issues/:id/upvote', authenticate, allow('citizen'), (req, res) => {
  const id = positiveId(req.params.id);
  const issue = db.prepare('SELECT id,status FROM issues WHERE id=?').get(id);
  if (!issue) throw fail(404, 'ISSUE_NOT_FOUND', 'This report could not be found.');
  if (issue.status === 'Resolved' || issue.status === 'Rejected') throw fail(409, 'ISSUE_CLOSED', 'This report is closed.');
  const existing = db.prepare('SELECT 1 FROM upvotes WHERE user_id=? AND issue_id=?').get(req.auth.id, id);
  if (existing) throw fail(409, 'ALREADY_UPVOTED', 'You have already supported this report.');
  db.prepare('INSERT INTO upvotes (user_id,issue_id) VALUES (?,?)').run(req.auth.id,id);
  db.prepare('UPDATE issues SET priority_score=priority_score+1 WHERE id=?').run(id);
  award(req.auth.id,id,'upvote',1);
  res.status(201).json({ ok: true });
});

router.post('/issues/:id/vote', authenticate, allow('citizen'), (req, res) => {
  const id = positiveId(req.params.id);
  const month = new Date().toISOString().slice(0,7);
  const issue = db.prepare('SELECT id,status FROM issues WHERE id=?').get(id);
  if (!issue) throw fail(404,'ISSUE_NOT_FOUND','This report could not be found.');
  if (issue.status === 'Resolved' || issue.status === 'Rejected') throw fail(409,'ISSUE_CLOSED','Only open reports can receive priority votes.');
  const tx = db.transaction(() => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM monthly_votes WHERE user_id=? AND month=?').get(req.auth.id,month).count;
    if (count >= 5) throw fail(409,'VOTE_LIMIT_REACHED','You have used all 5 priority votes for this month.');
    const existing = db.prepare('SELECT 1 FROM monthly_votes WHERE user_id=? AND issue_id=? AND month=?').get(req.auth.id,id,month);
    if (existing) throw fail(409,'ALREADY_VOTED','You already voted for this report this month.');
    db.prepare('INSERT INTO monthly_votes (user_id,issue_id,month) VALUES (?,?,?)').run(req.auth.id,id,month);
    award(req.auth.id,id,'vote',2,month);
  });
  tx();
  res.status(201).json({ ok: true });
});

router.post('/issues/:id/comments', authenticate, (req, res) => {
  const id = positiveId(req.params.id);
  const input = parse(z.object({ body: z.string().trim().min(2).max(1000) }), req.body);
  if (!db.prepare('SELECT id FROM issues WHERE id=?').get(id)) throw fail(404,'ISSUE_NOT_FOUND','This report could not be found.');
  const result = db.prepare('INSERT INTO comments (issue_id,user_id,body) VALUES (?,?,?)').run(id,req.auth.id,input.body);
  res.status(201).json({ comment: db.prepare(`SELECT c.*,u.name AS user_name,u.role FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?`).get(result.lastInsertRowid) });
});

router.patch('/issues/:id/status', authenticate, allow('official','admin'), upload.single('afterPhoto'), (req, res) => {
  const input = parse(z.object({
    status: z.enum(statuses),
    note: z.string().trim().min(5).max(500)
  }), req.body);
  const issueId = positiveId(req.params.id);
  const issue = db.prepare('SELECT * FROM issues WHERE id=?').get(issueId);
  if (!issue) throw fail(404,'ISSUE_NOT_FOUND','This report could not be found.');
  if (req.auth.role === 'official') {
    const official = db.prepare('SELECT department_id FROM users WHERE id=?').get(req.auth.id);
    if (!official?.department_id || official.department_id !== issue.department_id) throw fail(403,'ISSUE_NOT_ASSIGNED','This report is assigned to another department.');
  }
  if (['Resolved','Rejected'].includes(issue.status)) throw fail(409,'ISSUE_CLOSED','Closed reports cannot be changed.');
  if (!transitions[issue.status]?.includes(input.status)) throw fail(409,'INVALID_TRANSITION',`Move this report from ${issue.status} to ${transitions[issue.status]?.join(' or ') || 'a valid next status'}.`);
  const ackAt = input.status === 'Acknowledged' && !issue.acknowledged_at ? new Date().toISOString() : issue.acknowledged_at;
  const resolvedAt = input.status === 'Resolved' ? new Date().toISOString() : issue.resolved_at;
  const tx = db.transaction(() => {
    db.prepare('UPDATE issues SET status=?,acknowledged_at=?,resolved_at=?,after_photo_path=COALESCE(?,after_photo_path) WHERE id=?')
      .run(input.status,ackAt,resolvedAt,req.file ? `/uploads/${req.file.filename}` : null,issueId);
    db.prepare('INSERT INTO issue_events (issue_id,actor_id,old_status,new_status,note) VALUES (?,?,?,?,?)')
      .run(issueId,req.auth.id,issue.status,input.status,input.note);
    if (input.status === 'Resolved') award(issue.reporter_id,issueId,'resolved',25);
  });
  tx();
  statusNotification(issue,input.status,req.app.get('io'));
  res.json({ issue: db.prepare('SELECT * FROM issues WHERE id=?').get(issueId) });
});

router.get('/priorities', optionalAuthenticate, (req, res) => {
  const month = new Date().toISOString().slice(0,7);
  const issues = db.prepare(`${issueSelect.replace('(SELECT COUNT(*) FROM monthly_votes mv WHERE mv.issue_id=i.id AND mv.month=?) AS month_votes',
    '(SELECT COUNT(*) FROM monthly_votes mv WHERE mv.issue_id=i.id AND mv.month=?) AS month_votes')}
    WHERE i.status NOT IN ('Resolved','Rejected') ORDER BY month_votes DESC, i.priority_score DESC LIMIT 10`)
    .all(month).map(issue => ({
      ...issue,
      ...issueMetrics(issue),
      viewerVoted: req.auth ? Boolean(db.prepare('SELECT 1 FROM monthly_votes WHERE user_id=? AND issue_id=? AND month=?').get(req.auth.id,issue.id,month)) : false
    }));
  res.json({ issues, month, votesUsed: req.auth ? db.prepare('SELECT COUNT(*) AS count FROM monthly_votes WHERE user_id=? AND month=?').get(req.auth.id,month).count : null });
});

router.get('/notifications', authenticate, (req,res) => {
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(req.auth.id);
  const unread = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND is_read=0').get(req.auth.id).count;
  res.json({ notifications, unread });
});
router.patch('/notifications/read-all', authenticate, (req,res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').run(req.auth.id);
  res.json({ ok:true });
});
router.patch('/notifications/:id/read', authenticate, (req,res) => {
  db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(positiveId(req.params.id),req.auth.id);
  res.json({ ok:true });
});

router.get('/stats', (_req,res) => {
  const total = db.prepare('SELECT COUNT(*) AS count FROM issues').get().count;
  const resolved = db.prepare("SELECT COUNT(*) AS count FROM issues WHERE status='Resolved'").get().count;
  const acks = db.prepare('SELECT created_at,acknowledged_at FROM issues WHERE acknowledged_at IS NOT NULL').all();
  const avg = acks.length ? acks.reduce((sum,row) => sum + hoursBetween(row.created_at,row.acknowledged_at),0)/acks.length : 0;
  res.json({ reported: total, resolved, responseHours: avg, wards: db.prepare('SELECT COUNT(*) AS count FROM wards').get().count });
});

router.get('/leaderboard', (req,res) => {
  const period = parse(z.enum(['month','quarter','all']).default('all'),req.query.period);
  const from = period === 'month' ? new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString() :
    period === 'quarter' ? new Date(Date.now() - 90*86400000).toISOString() : '1970-01-01';
  const aggregate = (kind) => {
    const isDept = kind === 'departments';
    const table = isDept ? 'departments' : 'wards';
    const join = isDept ? 'i.department_id=e.id' : 'i.ward_id=e.id';
    return db.prepare(`SELECT e.id,e.name,COUNT(i.id) AS total,
      SUM(CASE WHEN i.status='Resolved' THEN 1 ELSE 0 END) AS resolved,
      SUM(CASE WHEN i.status NOT IN ('Resolved','Rejected') AND (julianday('now')-julianday(i.created_at))*24 >
        CASE i.category WHEN 'Water Leak' THEN 24 WHEN 'Garbage' THEN 48 WHEN 'Drainage' THEN 48 WHEN 'Pothole' THEN 72 ELSE 120 END
        THEN 1 ELSE 0 END) AS overdue,
      AVG(CASE WHEN i.acknowledged_at IS NOT NULL THEN (julianday(i.acknowledged_at)-julianday(i.created_at))*24 END) AS avg_response,
      AVG(CASE WHEN i.resolved_at IS NOT NULL THEN (julianday(i.resolved_at)-julianday(i.created_at))*24 END) AS avg_resolution
      FROM ${table} e LEFT JOIN issues i ON ${join} AND i.created_at>=? GROUP BY e.id ORDER BY e.id`).all(from)
      .map(row => {
        const resolutionRate = row.total ? (row.resolved || 0)/row.total*100 : 0;
        const responseScore = row.avg_response == null ? 50 : Math.max(0,100-row.avg_response/2);
        const resolveScore = row.avg_resolution == null ? 50 : Math.max(0,100-row.avg_resolution/12);
        const overdueRate = row.total ? (row.overdue || 0)/row.total : 0;
        const accountabilityScore = Math.round(Math.max(0,Math.min(100,
          responseScore*.25 + resolveScore*.25 + resolutionRate*.4 + (1-overdueRate)*100*.1)));
        return { ...row, resolution_rate: Math.round(resolutionRate), avg_response: Math.round(row.avg_response || 0), avg_resolution: Math.round(row.avg_resolution || 0), overdue: row.overdue || 0, accountability_score: accountabilityScore };
      }).sort((a,b) => b.accountability_score-a.accountability_score);
  };
  const departments = aggregate('departments');
  const wards = aggregate('wards');
  const trend = db.prepare(`SELECT strftime('%Y-%m',created_at) AS month, COUNT(*) AS reported,
    SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved
    FROM issues WHERE created_at>=datetime('now','-6 months') GROUP BY month ORDER BY month`).all();
  res.json({ departments, wards, trend, period });
});

router.get('/leaderboard/citizens', (_req,res) => {
  res.json({ citizens: db.prepare(`SELECT u.id,u.name,COALESCE(SUM(p.points),0) AS points,
    COUNT(DISTINCT i.id) AS reports FROM users u LEFT JOIN point_ledger p ON p.user_id=u.id
    LEFT JOIN issues i ON i.reporter_id=u.id WHERE u.role='citizen' GROUP BY u.id ORDER BY points DESC LIMIT 10`).all() });
});

router.get('/profile', authenticate, (req,res) => {
  const user = userById(req.auth.id);
  const points = db.prepare('SELECT COALESCE(SUM(points),0) AS points FROM point_ledger WHERE user_id=?').get(user.id).points;
  const reports = db.prepare('SELECT COUNT(*) AS count FROM issues WHERE reporter_id=?').get(user.id).count;
  const resolved = db.prepare("SELECT COUNT(*) AS count FROM issues WHERE reporter_id=? AND status='Resolved'").get(user.id).count;
  const badges = points >= 100 ? ['City Guardian','Neighbourhood Hero','Active Citizen','Newcomer'] :
    points >= 50 ? ['Neighbourhood Hero','Active Citizen','Newcomer'] : points >= 20 ? ['Active Citizen','Newcomer'] : ['Newcomer'];
  res.json({ user, points, reports, resolved, badges });
});

router.get('/official/queue', authenticate, allow('official','admin'), (req,res) => {
  const user = userById(req.auth.id);
  const deptId = req.auth.role === 'admin' && req.query.departmentId ? positiveId(req.query.departmentId) : user.department_id;
  const issues = db.prepare(`${issueSelect.replace('(SELECT COUNT(*) FROM monthly_votes mv WHERE mv.issue_id=i.id AND mv.month=?) AS month_votes',
    '(SELECT COUNT(*) FROM monthly_votes mv WHERE mv.issue_id=i.id AND mv.month=?) AS month_votes')}
    WHERE i.status NOT IN ('Resolved','Rejected') ${deptId ? 'AND i.department_id=?' : ''}
    ORDER BY month_votes DESC,i.priority_score DESC,i.created_at ASC LIMIT 100`)
    .all(new Date().toISOString().slice(0,7), ...(deptId ? [deptId] : []))
    .map(issue => ({ ...issue, ...issueMetrics(issue) }));
  res.json({ issues, departmentId: deptId });
});

router.patch('/admin/issues/:id/assign', authenticate, allow('admin'), (req,res) => {
  const input = parse(z.object({ departmentId: z.number().int().positive() }),req.body);
  if (!db.prepare('SELECT id FROM departments WHERE id=?').get(input.departmentId)) throw fail(404,'DEPARTMENT_NOT_FOUND','Choose a valid department.');
  const result = db.prepare('UPDATE issues SET department_id=? WHERE id=?').run(input.departmentId,positiveId(req.params.id));
  if (!result.changes) throw fail(404,'ISSUE_NOT_FOUND','This report could not be found.');
  res.json({ ok:true });
});

router.post('/admin/departments', authenticate, allow('admin'), (req,res) => {
  const input = parse(z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(250).default('')
  }),req.body);
  const result = db.prepare('INSERT INTO departments (name,description) VALUES (?,?)').run(input.name,input.description);
  res.status(201).json({ department: db.prepare('SELECT * FROM departments WHERE id=?').get(result.lastInsertRowid) });
});

router.patch('/admin/departments/:id', authenticate, allow('admin'), (req,res) => {
  const id = positiveId(req.params.id);
  const input = parse(z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(250).default('')
  }),req.body);
  const result = db.prepare('UPDATE departments SET name=?,description=? WHERE id=?').run(input.name,input.description,id);
  if (!result.changes) throw fail(404,'DEPARTMENT_NOT_FOUND','This department could not be found.');
  res.json({ department: db.prepare('SELECT * FROM departments WHERE id=?').get(id) });
});

router.post('/admin/wards', authenticate, allow('admin'), (req,res) => {
  const input = parse(z.object({
    name: z.string().trim().min(2).max(80),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }),req.body);
  const result = db.prepare('INSERT INTO wards (name,latitude,longitude) VALUES (?,?,?)')
    .run(input.name,input.latitude,input.longitude);
  res.status(201).json({ ward: db.prepare('SELECT * FROM wards WHERE id=?').get(result.lastInsertRowid) });
});

router.patch('/admin/wards/:id', authenticate, allow('admin'), (req,res) => {
  const id = positiveId(req.params.id);
  const input = parse(z.object({
    name: z.string().trim().min(2).max(80),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }),req.body);
  const result = db.prepare('UPDATE wards SET name=?,latitude=?,longitude=? WHERE id=?')
    .run(input.name,input.latitude,input.longitude,id);
  if (!result.changes) throw fail(404,'WARD_NOT_FOUND','This ward could not be found.');
  res.json({ ward: db.prepare('SELECT * FROM wards WHERE id=?').get(id) });
});
