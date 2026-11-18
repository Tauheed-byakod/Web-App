import bcrypt from 'bcrypt';
import fs from 'node:fs';
import path from 'node:path';
import { db, uploadDir } from './index.js';

const departments = [
  ['Roads','Road maintenance and street safety'],
  ['Electricity','Street lighting and electrical infrastructure'],
  ['Water Supply','Water mains, leaks and public taps'],
  ['Sanitation','Waste collection and public cleanliness'],
  ['Drainage','Stormwater drains and flood prevention']
];
const wards = [
  ['Central Ward',12.9716,77.5946],['Lakeview Ward',12.9752,77.6018],
  ['Market Ward',12.9678,77.5869],['Garden Ward',12.9632,77.5984],
  ['East Park Ward',12.9804,77.6122],['Millers Ward',12.9872,77.5921],
  ['South Gate Ward',12.9566,77.5905],['Tech Park Ward',12.9688,77.6165]
];
const imageNames = ['sample-pothole.svg','sample-streetlight.svg','sample-water.svg','sample-cleanup.svg'];
const imageColors = [['#d97706','#fef3c7','Road repair'],['#2563eb','#dbeafe','Streetlight'],['#0891b2','#cffafe','Water works'],['#16a34a','#dcfce7','Clean streets']];
for (let i=0;i<imageNames.length;i++) {
  const [ink,soft,label] = imageColors[i];
  fs.writeFileSync(path.join(uploadDir,imageNames[i]),`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="640" viewBox="0 0 1000 640"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${soft}"/><stop offset="1" stop-color="#f8fafc"/></linearGradient></defs><rect width="1000" height="640" fill="url(#g)"/><circle cx="780" cy="170" r="115" fill="${ink}" opacity=".12"/><path d="M0 450 250 320l195 94 225-176 330 178v224H0Z" fill="${ink}" opacity=".13"/><rect x="105" y="106" width="790" height="428" rx="32" fill="#fff" opacity=".8"/><circle cx="500" cy="275" r="72" fill="${soft}" stroke="${ink}" stroke-width="8"/><path d="M500 180c-55 0-100 42-100 96 0 73 100 177 100 177s100-104 100-177c0-54-45-96-100-96Zm0 130a35 35 0 1 1 0-70 35 35 0 0 1 0 70Z" fill="${ink}"/><text x="500" y="487" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" font-weight="700" fill="#0f172a">${label} · Metro City</text><text x="500" y="527" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#475569">CivicGaps community report</text></svg>`);
}

const wipe = db.transaction(() => {
  db.exec('DELETE FROM notifications; DELETE FROM comments; DELETE FROM monthly_votes; DELETE FROM upvotes; DELETE FROM point_ledger; DELETE FROM issue_events; DELETE FROM issues; DELETE FROM users; DELETE FROM departments; DELETE FROM wards;');
});
wipe();
const insertDept = db.prepare('INSERT INTO departments (name,description) VALUES (?,?)');
departments.forEach(row=>insertDept.run(...row));
const insertWard = db.prepare('INSERT INTO wards (name,latitude,longitude) VALUES (?,?,?)');
wards.forEach(row=>insertWard.run(...row));

const password = bcrypt.hashSync('demo123',10);
const insertUser = db.prepare('INSERT INTO users (name,email,password_hash,role,department_id) VALUES (?,?,?,?,?)');
const citizens=[];
for(let i=1;i<=30;i++) {
  const email = i===1 ? 'citizen@demo.com' : `resident${String(i).padStart(2,'0')}@demo.com`;
  const id = Number(insertUser.run(i===1?'Asha Rao':`Metro Resident ${i}`,email,password,'citizen',null).lastInsertRowid);
  citizens.push({id,name:i===1?'Asha Rao':`Metro Resident ${i}`});
}
const officialNames=['Arjun Kumar','Meera Nair','Ravi Shetty','Kavya Iyer','Naveen Das'];
const officials=[];
for(let i=0;i<5;i++) {
  const email=i===0?'official@demo.com':`official${i+1}@demo.com`;
  officials.push(Number(insertUser.run(officialNames[i],email,password,'official',i+1).lastInsertRowid));
}
const adminId=Number(insertUser.run('City Administrator','admin@demo.com',password,'admin',null).lastInsertRowid);

let seed=9417;
const random=()=>{ seed=(seed*48271)%2147483647; return seed/2147483647; };
const pick=(values)=>values[Math.floor(random()*values.length)];
const categories=['Pothole','Streetlight','Water Leak','Garbage','Drainage'];
const departmentByCategory={Pothole:1,Streetlight:2,'Water Leak':3,Garbage:4,Drainage:5};
const examples={
  Pothole:['Deep pothole beside the bus stop','Road surface broken after utility work','Unsafe crater near school crossing','Cracked asphalt on a busy junction'],
  Streetlight:['Streetlight out on the walking route','Dark stretch beside the public park','Two lamps flickering near the bus stand','Lamp post not working after rain'],
  'Water Leak':['Clean water flowing from a pipe joint','Water main leak outside apartment gate','Public tap will not stop running','Roadside pipe leak wasting water'],
  Garbage:['Overflowing bins at the market entrance','Missed waste pickup on residential lane','Loose rubbish spreading near the park','Community bin needs an urgent collection'],
  Drainage:['Storm drain blocked with silt','Water pooling at the crossing','Open drain cover missing near footpath','Drain overflowing after light rain']
};
const descriptions={
  Pothole:'Residents and daily commuters have to swerve into traffic to avoid this damaged patch. Please inspect and make the surface safe.',
  Streetlight:'This section is very dark after sunset and people walking home cannot see the footpath clearly. Please check the electrical connection.',
  'Water Leak':'Water has been running for several hours and the pavement is getting slippery. Please send a crew to inspect the nearby pipe.',
  Garbage:'The collection point is full and litter is reaching the footpath. Neighbours are concerned about hygiene and stray animals.',
  Drainage:'The drain is not carrying runoff and water is collecting beside the crossing. Please clear the blockage before the next rainfall.'
};
const performance=[{ack:3,resolve:27},{ack:15,resolve:90},{ack:7,resolve:50},{ack:5,resolve:42},{ack:11,resolve:75}];
const statuses=['Reported','Acknowledged','In Progress','Resolved','Rejected'];
const now=Date.now();
const insertIssue=db.prepare(`INSERT INTO issues (reporter_id,title,description,category,photo_path,latitude,longitude,status,priority_score,department_id,ward_id,created_at,acknowledged_at,resolved_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const eventInsert=db.prepare('INSERT INTO issue_events (issue_id,actor_id,old_status,new_status,note,created_at) VALUES (?,?,?,?,?,?)');
const ledger=db.prepare('INSERT OR IGNORE INTO point_ledger (user_id,issue_id,action,points,created_at,period) VALUES (?,?,?,?,?,?)');
const issues=[];
for(let i=0;i<100;i++) {
  const category=i===0?'Pothole':pick(categories);
  const deptId=departmentByCategory[category];
  const deptPerf=performance[deptId-1];
  const ageDays=Math.floor(random()*90)+1;
  const createdAt=new Date(now-ageDays*86400000-Math.floor(random()*86400000)).toISOString();
  const elapsedHours=(now-new Date(createdAt).getTime())/3600000;
  const status=i===0?'Reported':pick(i%6===0?['Reported','Acknowledged']:statuses);
  const ackDelay=Math.min(deptPerf.ack*(.3+random()*2),elapsedHours*.5);
  const resolvedDelay=Math.max(ackDelay+Math.min(deptPerf.ack*.5,elapsedHours*.2)+1,
    Math.min(deptPerf.resolve*(.35+random()*2.2),elapsedHours*.9));
  const acknowledgedAt=status==='Reported'?null:new Date(new Date(createdAt).getTime()+ackDelay*3600000).toISOString();
  const resolvedAt=status==='Resolved'?new Date(new Date(createdAt).getTime()+resolvedDelay*3600000).toISOString():null;
  const wardIndex=Math.floor(random()*wards.length);
  const ward=wards[wardIndex];
  const lat=ward[1]+(random()-.5)*.008;
  const lng=ward[2]+(random()-.5)*.009;
  const photo=(i%3===0)?`/uploads/${imageNames[i%imageNames.length]}`:null;
  const insert=insertIssue.run(i===0?citizens[0].id:citizens[Math.floor(random()*citizens.length)].id,
    `${pick(examples[category])} · ${ward[0].replace(' Ward','')}`,
    descriptions[category],category,photo,lat,lng,status,Math.floor(random()*15),deptId,wardIndex+1,createdAt,acknowledgedAt,resolvedAt);
  const id=Number(insert.lastInsertRowid);
  issues.push({id,category,status,createdAt});
  eventInsert.run(id,citizens[0].id,null,'Reported','Report submitted by a resident',createdAt);
  if(acknowledgedAt) eventInsert.run(id,officials[deptId-1],'Reported','Acknowledged','Department reviewed the report and assigned a field team.',acknowledgedAt);
  if(['In Progress','Resolved'].includes(status)) {
    const progressAt=new Date(new Date(acknowledgedAt||createdAt).getTime()+Math.max(1,deptPerf.ack)*1800000).toISOString();
    eventInsert.run(id,officials[deptId-1],'Acknowledged','In Progress','A field crew has been assigned and work is underway.',progressAt);
  }
  if(status==='Rejected') {
    const rejectedAt=new Date(now-3600000).toISOString();
    eventInsert.run(id,officials[deptId-1],acknowledgedAt?'Acknowledged':'Reported','Rejected','The department reviewed the report and explained why it is outside the service scope.',rejectedAt);
  }
  if(resolvedAt) {
    eventInsert.run(id,officials[deptId-1],'In Progress','Resolved',pick(['Repair completed and inspected on site.','The crew has completed the work. Thank you for reporting it.','Issue fixed; the area is safe to use again.']),resolvedAt);
    ledger.run(db.prepare('SELECT reporter_id FROM issues WHERE id=?').get(id).reporter_id,id,'resolved',25,resolvedAt,'');
  }
  const reporter=db.prepare('SELECT reporter_id FROM issues WHERE id=?').get(id).reporter_id;
  ledger.run(reporter,id,'report',10,createdAt,'');
}

const upvoteInsert=db.prepare('INSERT OR IGNORE INTO upvotes (user_id,issue_id,created_at) VALUES (?,?,?)');
const voteInsert=db.prepare('INSERT OR IGNORE INTO monthly_votes (user_id,issue_id,month,created_at) VALUES (?,?,?,?)');
const openIssues=issues.filter(issue=>!['Resolved','Rejected'].includes(issue.status));
for(const citizen of citizens) {
  const supported=new Set();
  for(let n=0;n<12;n++) {
    const issue=pick(issues);
    if(issue) {
      const created=new Date(now-Math.floor(random()*45*86400000)).toISOString();
      upvoteInsert.run(citizen.id,issue.id,created);
      if(supported.size<5 && !supported.has(issue.id) && openIssues.includes(issue)) {
        voteInsert.run(citizen.id,issue.id,new Date(now).toISOString().slice(0,7),created);
        ledger.run(citizen.id,issue.id,'vote',2,created,new Date(now).toISOString().slice(0,7));
        supported.add(issue.id);
      }
    }
  }
}
const commentInsert=db.prepare('INSERT INTO comments (issue_id,user_id,body,created_at) VALUES (?,?,?,?)');
const commentSamples=[
  'I walk past here every day. Thank you for bringing this up.',
  'This is still affecting the route to the bus stop.',
  'I have shared this with neighbours in the ward.',
  'Could the team also check the stretch just around the corner?',
  'Appreciate the update. Please keep the timeline current.'
];
for(let i=0;i<36;i++) {
  const issue=pick(issues);
  commentInsert.run(issue.id,citizens[Math.floor(random()*citizens.length)].id,pick(commentSamples),
    new Date(now-Math.floor(random()*50*86400000)).toISOString());
}
const notificationInsert=db.prepare('INSERT INTO notifications (user_id,issue_id,message,is_read,created_at) VALUES (?,?,?,?,?)');
for(let i=0;i<20;i++) {
  const issue=pick(issues);
  notificationInsert.run(citizens[i%citizens.length].id,issue.id,
    `${issue.category} report updated: ${issue.status}.`,i%3===0?0:1,
    new Date(now-Math.floor(random()*10*86400000)).toISOString());
}
console.log(`Seeded Metro City: ${db.prepare('SELECT COUNT(*) AS n FROM issues').get().n} issues, 8 wards, 5 departments, 30 citizens, 5 officials, 1 admin.`);
console.log('Demo password for citizen@demo.com, official@demo.com and admin@demo.com: demo123');
db.close();
