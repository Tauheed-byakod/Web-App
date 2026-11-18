import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { io } from 'socket.io-client';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Award, Bell, Bike, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, Droplets, ExternalLink, Eye, Filter, Flag, Gauge,
  Heart, Lightbulb, LoaderCircle, LogIn, LogOut, Map, MapPin, Menu, MessageCircle, Moon,
  Plus, Radio, Search, Send, Shield, Sparkles, Sun, ThumbsUp, Trophy, Users, Vote, X
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import { api, getToken, imageUrl } from './api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LocationMap } from './components/MapPicker';

const categories=['Pothole','Streetlight','Water Leak','Garbage','Drainage','Other'];
const statuses=['Reported','Acknowledged','In Progress','Resolved','Rejected'];
const nextStatuses={
  Reported:['Acknowledged','Rejected'],
  Acknowledged:['In Progress','Rejected'],
  'In Progress':['Resolved','Rejected']
};
const statusClass={
  Reported:'bg-red-50 text-red-700 ring-red-200',Acknowledged:'bg-amber-50 text-amber-800 ring-amber-200',
  'In Progress':'bg-blue-50 text-blue-700 ring-blue-200',Resolved:'bg-teal-50 text-teal-800 ring-teal-200',
  Rejected:'bg-slate-100 text-slate-600 ring-slate-200'
};
const slaClass={within:'bg-emerald-50 text-emerald-700 ring-emerald-200',near:'bg-amber-50 text-amber-800 ring-amber-200',overdue:'bg-red-50 text-red-700 ring-red-200'};
const categoryIcon={Pothole:Bike,Streetlight:Lightbulb,'Water Leak':Droplets,Garbage:Activity,Drainage:Droplets,Other:Flag};
const cls=(...parts)=>parts.filter(Boolean).join(' ');
const formatDate=(date,opts={month:'short',day:'numeric',year:'numeric'})=>date?new Date(date).toLocaleDateString('en-IN',opts):'—';
const formatHours=(hours)=>hours==null?'—':hours<1?`${Math.max(1,Math.round(hours*60))} min`:`${hours<24?hours.toFixed(1):Math.floor(hours/24)} ${hours<24?'hr':'days'}`;

function useResource(path,dependencies=[]) {
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try { setData(await api(path)); }
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[path,...dependencies]);
  useEffect(()=>{refresh();},[refresh]);
  return {data,loading,error,refresh};
}

function AppShell() {
  const {user,signOut,notify}=useAuth();
  const [dark,setDark]=useState(localStorage.getItem('civicgaps-theme')==='dark');
  const [menu,setMenu]=useState(false);
  const [notifications,setNotifications]=useState([]);
  const [unread,setUnread]=useState(0);
  const [bellOpen,setBellOpen]=useState(false);
  const [socketOnline,setSocketOnline]=useState(false);
  useEffect(()=>{
    document.documentElement.classList.toggle('dark',dark);
    localStorage.setItem('civicgaps-theme',dark?'dark':'light');
  },[dark]);
  const loadNotifications=useCallback(async()=>{
    if(!user)return;
    try{const response=await api('/notifications');setNotifications(response.notifications);setUnread(response.unread);}
    catch(e){notify(e.message,'error');}
  },[user,notify]);
  useEffect(()=>{
    loadNotifications();
    if(!user||!getToken()){setSocketOnline(false);return;}
    const socket=io(import.meta.env.VITE_SOCKET_URL||'http://localhost:4000',{auth:{token:getToken()},reconnection:true});
    let showedOffline=false;
    socket.on('connect',()=>{setSocketOnline(true);showedOffline=false;loadNotifications();});
    socket.on('disconnect',()=>setSocketOnline(false));
    socket.on('notification',item=>{
      setNotifications(current=>[item,...current].slice(0,30));
      setUnread(current=>current+1);
      notify(item.message,'info');
    });
    socket.on('connect_error',error=>{
      setSocketOnline(false);
      if(!showedOffline){notify(`Live updates are offline: ${error.message}. Your inbox will reconnect automatically.`,'error');showedOffline=true;}
    });
    return ()=>socket.disconnect();
  },[user,loadNotifications,notify]);
  const markRead=async(item)=>{
    try{await api(`/notifications/${item.id}/read`,{method:'PATCH'});setNotifications(list=>list.map(n=>n.id===item.id?{...n,is_read:1}:n));if(!item.is_read)setUnread(n=>Math.max(0,n-1));}
    catch(e){notify(e.message,'error');}
  };
  const markAll=async()=>{
    try{await api('/notifications/read-all',{method:'PATCH'});setNotifications(list=>list.map(n=>({...n,is_read:1})));setUnread(0);}
    catch(e){notify(e.message,'error');}
  };
  return <div className="min-h-screen bg-mist text-slate-800 transition-colors dark:bg-[#091521] dark:text-slate-100">
    <header className="sticky top-0 z-[1000] border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0b1c2d]/95">
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-4 sm:px-7">
        <Link to="/" className="flex items-center gap-2.5" onClick={()=>setMenu(false)}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white shadow-lg shadow-teal-900/15"><MapPin size={19}/></span>
          <span className="text-[17px] font-extrabold tracking-tight text-navy-900 dark:text-white">civic<span className="text-teal-600">gaps</span></span>
        </Link>
        <nav className={cls('nav-links',menu?'nav-open':'')}>
          <NavLink to="/explore" icon={Map} onClick={()=>setMenu(false)}>Explore</NavLink>
          <NavLink to="/leaderboard" icon={Trophy} onClick={()=>setMenu(false)}>Accountability</NavLink>
          <NavLink to="/priorities" icon={Vote} onClick={()=>setMenu(false)}>Priorities</NavLink>
          {user&&<NavLink to="/dashboard" icon={Gauge} onClick={()=>setMenu(false)}>Dashboard</NavLink>}
          {user?.role==='citizen'&&<NavLink to="/my-reports" icon={Flag} onClick={()=>setMenu(false)}>My reports</NavLink>}
          {!user&&<NavLink to="/login" icon={LogIn} onClick={()=>setMenu(false)}>Sign in</NavLink>}
        </nav>
        <div className="flex items-center gap-2">
          <button aria-label="Toggle dark mode" className="icon-btn" onClick={()=>setDark(value=>!value)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button>
          {user&&<div className="relative">
            <button aria-label={`Notifications, ${unread} unread, live ${socketOnline?'connected':'reconnecting'}`} className="icon-btn relative" onClick={()=>setBellOpen(open=>!open)}>
              <Bell size={18}/><span className={cls('absolute bottom-1 right-1 h-2 w-2 rounded-full ring-2 ring-white dark:ring-[#0b1c2d]',socketOnline?'bg-emerald-500':'bg-amber-500')}/>{unread>0&&<span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white">{unread>9?'9+':unread}</span>}
            </button>
            {bellOpen&&<div className="notification-popover">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700"><div><b className="text-sm">Notifications</b><p className="mt-0.5 text-[10px] text-slate-400">{socketOnline?'Live updates connected':'Live updates reconnecting'}</p></div><button className="text-xs font-semibold text-teal-700" onClick={markAll}>Mark all read</button></div>
              <div className="max-h-80 overflow-y-auto">{notifications.length?notifications.slice(0,8).map(item=><Link key={item.id} to={item.issue_id?`/issues/${item.issue_id}`:'/notifications'} onClick={()=>{markRead(item);setBellOpen(false);}} className={cls('block border-b border-slate-50 px-4 py-3 text-xs leading-5 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800',!item.is_read&&'bg-teal-50/60 dark:bg-teal-900/10')}>{item.message}<span className="mt-1 block text-[10px] text-slate-400">{formatDate(item.created_at,{month:'short',day:'numeric'})}</span></Link>):<p className="p-5 text-center text-xs text-slate-500">You’re all caught up.</p>}</div>
              <Link to="/notifications" onClick={()=>setBellOpen(false)} className="block p-3 text-center text-xs font-bold text-teal-700">See all notifications</Link>
            </div>}
          </div>}
          {user?<div className="hidden items-center gap-2 sm:flex"><Link to="/profile" className="flex items-center gap-2 rounded-full pr-2 text-sm font-semibold text-slate-700 hover:text-teal-700 dark:text-slate-100"><Avatar name={user.name}/><span className="max-w-28 truncate">{user.name.split(' ')[0]}</span></Link><button className="icon-btn" aria-label="Sign out" onClick={()=>{signOut();notify('You have signed out.','info');}}><LogOut size={17}/></button></div>:<Link to="/login" className="hidden rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700 sm:inline-flex">Sign in</Link>}
          <button aria-label="Open menu" className="icon-btn md:hidden" onClick={()=>setMenu(open=>!open)}>{menu?<X size={20}/>:<Menu size={20}/>}</button>
        </div>
      </div>
    </header>
    <main className="min-h-[calc(100vh-68px)]">
      <Routes>
        <Route path="/" element={<Landing/>}/>
        <Route path="/explore" element={<Explore/>}/>
        <Route path="/report" element={<RequireRole role="citizen"><ReportPage/></RequireRole>}/>
        <Route path="/issues/:id" element={<IssuePage/>}/>
        <Route path="/leaderboard" element={<Leaderboard/>}/>
        <Route path="/priorities" element={<Priorities/>}/>
        <Route path="/my-reports" element={<RequireRole role="citizen"><MyReports/></RequireRole>}/>
        <Route path="/notifications" element={<RequireAuth><NotificationsPage/></RequireAuth>}/>
        <Route path="/profile" element={<RequireAuth><Profile/></RequireAuth>}/>
        <Route path="/dashboard" element={<RequireAuth><Dashboard/></RequireAuth>}/>
        <Route path="/login" element={user?<Navigate to="/dashboard" replace/>:<AuthPage/>}/>
        <Route path="/register" element={user?<Navigate to="/dashboard" replace/>:<AuthPage register/>}/>
        <Route path="*" element={<NotFound/>}/>
      </Routes>
    </main>
    <footer className="border-t border-slate-200 bg-white px-5 py-7 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#0b1c2d]">
      <p className="font-bold text-slate-700 dark:text-slate-200">CivicGaps · Metro City</p><p className="mt-1">Public issues deserve public answers.</p>
    </footer>
    <DemoPanel/>
    <Toast/>
  </div>;
}

function NavLink({to,icon:Icon,children,onClick}) {
  return <Link to={to} onClick={onClick} className="nav-item"><Icon size={16}/>{children}</Link>;
}
function Avatar({name,size='sm'}) {
  const initials=(name||'CG').split(' ').map(part=>part[0]).slice(0,2).join('').toUpperCase();
  return <span className={cls('grid shrink-0 place-items-center rounded-full bg-teal-100 font-bold text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',size==='lg'?'h-16 w-16 text-xl':'h-8 w-8 text-[11px]')}>{initials}</span>;
}
function Badge({children,tone='neutral',className=''}) {
  const tones={neutral:'bg-slate-100 text-slate-600 ring-slate-200',teal:'bg-teal-50 text-teal-800 ring-teal-200',amber:'bg-amber-50 text-amber-800 ring-amber-200',red:'bg-red-50 text-red-700 ring-red-200',green:'bg-emerald-50 text-emerald-700 ring-emerald-200'};
  return <span className={cls('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset',tones[tone]||tones.neutral,className)}>{children}</span>;
}
function StatusBadge({status}) { return <Badge className={statusClass[status]}>{status}</Badge>; }
function SlaBadge({state}) { return <Badge className={slaClass[state]}><Clock3 size={11}/>{state==='overdue'?'Overdue':state==='near'?'Near SLA':'Within SLA'}</Badge>; }
function Card({children,className='',...props}) { return <section className={cls('rounded-2xl border border-slate-200/80 bg-white shadow-card dark:border-slate-800 dark:bg-[#102235]',className)} {...props}>{children}</section>; }
function Button({children,variant='primary',className='',to,...props}) {
  const variants={primary:'bg-teal-600 text-white hover:bg-teal-700 focus:ring-teal-300',secondary:'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',dark:'bg-navy-900 text-white hover:bg-navy-800',danger:'bg-red-600 text-white hover:bg-red-700',ghost:'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'};
  const classes=cls('inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50',variants[variant],className);
  return to?<Link to={to} className={classes} {...props}>{children}</Link>:<button className={classes} {...props}>{children}</button>;
}
function PageTitle({eyebrow,title,description,action}) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div>{eyebrow&&<p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.18em] text-teal-700 dark:text-teal-400">{eyebrow}</p>}<h1 className="text-3xl font-extrabold tracking-tight text-navy-900 dark:text-white sm:text-[38px]">{title}</h1>{description&&<p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}</div>{action}</div>;
}
function Loading({label='Loading civic updates…'}) { return <div role="status" aria-label={label} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#102235]"><div className="skeleton h-4 w-36 rounded"/><div className="skeleton h-8 w-2/3 rounded"/><div className="skeleton h-3 w-full rounded"/><div className="skeleton h-3 w-4/5 rounded"/></div>; }
function ErrorState({message,retry}) { return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><b>We couldn’t load this view.</b><p className="mt-1">{message}</p>{retry&&<Button className="mt-3" variant="secondary" onClick={retry}>Try again</Button>}</div>; }
function Empty({icon:Icon=Search,title,detail,action}) { return <div className="grid min-h-56 place-items-center px-6 py-10 text-center"><div><span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800"><Icon size={22}/></span><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm text-slate-500">{detail}</p>{action&&<div className="mt-4">{action}</div>}</div></div>; }
function StatCard({icon:Icon,label,value,detail,accent='teal'}) {
  const color=accent==='amber'?'bg-amber-50 text-amber-700':accent==='blue'?'bg-blue-50 text-blue-700':accent==='red'?'bg-red-50 text-red-700':'bg-teal-50 text-teal-700';
  return <Card className="p-5"><div className="flex items-start justify-between"><span className={cls('grid h-10 w-10 place-items-center rounded-xl',color)}><Icon size={19}/></span>{detail&&<span className="text-[11px] font-semibold text-slate-400">{detail}</span>}</div><p className="mt-5 text-2xl font-extrabold tracking-tight text-navy-900 dark:text-white">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{label}</p></Card>;
}
function RequireAuth({children}) { const {user,loading}=useAuth();if(loading)return <Loading/>;return user?children:<Navigate to="/login" replace/>; }
function RequireRole({role,children}) { const {user,loading}=useAuth();if(loading)return <Loading/>;if(!user)return <Navigate to="/login" replace/>;if(user.role!==role)return <Navigate to="/dashboard" replace/>;return children; }

function Landing() {
  const {data,loading}=useResource('/stats');
  const leaderboard=useResource('/leaderboard?period=all');
  const top=(leaderboard.data?.departments||[]).slice(0,3);
  const hours=data?.responseHours||0;
  return <div>
    <section className="hero-section overflow-hidden">
      <div className="hero-grid-pattern"></div>
      <div className="relative mx-auto grid max-w-[1280px] items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
        <motion.div initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.55}}>
          <Badge className="border border-white/15 bg-white/10 text-teal-100 ring-0"><span className="live-dot"></span> A clearer view of city services</Badge>
          <h1 className="mt-6 max-w-2xl text-[42px] font-black leading-[1.06] tracking-[-.045em] text-white sm:text-6xl lg:text-[68px]">Report it.<br/><span className="text-teal-300">Track it.</span><br/>Make them fix it.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">The pothole on your commute. The streetlight on your block. Put every issue on the map—and every response on the record.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Button to="/report" className="bg-teal-500 px-5 py-3 hover:bg-teal-400">Report an issue <ArrowRight size={17}/></Button><Button to="/explore" variant="secondary" className="border-white/20 bg-white/5 px-5 py-3 text-white hover:bg-white/10">Explore the map <Map size={17}/></Button></div>
          <p className="mt-5 text-xs text-slate-400">No account? Browse every report and department score publicly.</p>
        </motion.div>
        <motion.div initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} transition={{duration:.65,delay:.1}} className="relative">
          <div className="absolute -inset-8 rounded-[40px] bg-teal-500/10 blur-3xl"></div>
          <div className="relative rounded-[26px] border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur">
            <div className="overflow-hidden rounded-[19px] border border-white/10 bg-[#dce9e8]">
              <LocationMap issues={[]} value={[12.9716,77.5946]} interactive={false} height="355px" zoom={13}/>
              <div className="absolute bottom-7 left-7 z-[500] rounded-2xl border border-white/80 bg-white/95 p-4 shadow-xl">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600"><MapPin size={19}/></span><div><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">On the map today</p><p className="text-xl font-extrabold text-navy-900">{loading?'—':(data?.reported||0).toLocaleString()} public reports</p></div></div>
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-3"><div className="flex -space-x-2">{['AR','MN','RS','+'].map((initial,i)=><span key={initial} className={cls('grid h-8 w-8 place-items-center rounded-full border-2 border-[#10283b] text-[9px] font-extrabold',i===3?'bg-teal-500 text-white':'bg-slate-200 text-navy-900')}>{initial}</span>)}</div><span className="text-xs font-semibold text-slate-300">Powered by local voices</span><span className="flex items-center gap-1.5 text-xs font-bold text-teal-200"><span className="live-dot"></span> Live tracker</span></div>
          </div>
        </motion.div>
      </div>
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-2 gap-3 px-5 pb-9 sm:grid-cols-4 sm:px-8">
        <HeroMetric label="Issues reported" value={data?.reported??'—'}/><HeroMetric label="Issues resolved" value={data?.resolved??'—'}/><HeroMetric label="Avg. first response" value={data?formatHours(hours):'—'}/><HeroMetric label="Wards covered" value={data?.wards??'—'}/>
      </div>
    </section>
    <section className="mx-auto max-w-[1280px] px-5 py-16 sm:px-8 sm:py-20">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Accountability, in the open</p><h2 className="section-title">Performance you can measure.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Every department gets the same public scorecard: how fast they respond, how much they resolve, and what is still overdue.</p></div><Link to="/leaderboard" className="inline-flex items-center gap-2 text-sm font-bold text-teal-700">See the full leaderboard <ArrowRight size={16}/></Link></div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">{leaderboard.loading?<Loading/>:top.map((item,index)=><Card key={item.id} className="flex items-center gap-4 p-5"><span className={cls('grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-black',index===0?'bg-amber-100 text-amber-700':index===1?'bg-slate-100 text-slate-600':'bg-orange-100 text-orange-700')}>{['01','02','03'][index]}</span><div className="min-w-0 flex-1"><p className="truncate font-extrabold text-navy-900 dark:text-white">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.resolution_rate}% resolved · {item.overdue} overdue</p></div><div className="text-right"><p className="text-xl font-black text-teal-700 dark:text-teal-300">{item.accountability_score}</p><p className="text-[10px] font-bold uppercase text-slate-400">score</p></div></Card>)}</div>
    </section>
    <section className="bg-white py-16 dark:bg-[#0d1e2d] sm:py-20"><div className="mx-auto max-w-[1280px] px-5 sm:px-8"><p className="eyebrow">Small actions. Visible progress.</p><h2 className="section-title">From a street corner to a public record.</h2><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
      [MapPin,'01','Pin the problem','Add a photo, choose a category and mark the exact spot. Your ward is matched automatically.'],
      [Users,'02','Build local support','Neighbours can upvote an existing report or spend one of five monthly priority votes.'],
      [Radio,'03','Follow every update','See when a department acknowledges, starts work and resolves the issue. Updates reach supporters live.'],
      [Activity,'04','Compare the response','Public scorecards make response times and unresolved backlogs easy to compare.']
    ].map(([Icon,n,title,desc])=><Card key={n} className="p-5"><span className="flex items-center justify-between"><Icon className="text-teal-600" size={22}/><span className="text-xs font-extrabold text-slate-300">{n}</span></span><h3 className="mt-6 font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p></Card>)}</div></div></section>
    <section className="mx-auto max-w-[1280px] px-5 py-16 sm:px-8"><div className="rounded-[28px] bg-navy-900 px-6 py-10 text-center text-white sm:px-12 sm:py-14"><Shield className="mx-auto text-teal-300" size={30}/><h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Your neighbourhood is worth a follow-up.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">Start a report, find one nearby, or see how Metro City’s departments are doing.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Button to="/report" className="bg-teal-500 hover:bg-teal-400">Make a report <ArrowRight size={16}/></Button><Button to="/leaderboard" variant="secondary" className="border-white/20 bg-white/5 text-white hover:bg-white/10">View accountability scores</Button></div></div></section>
  </div>;
}
function HeroMetric({label,value}) { return <div className="rounded-2xl border border-white/10 bg-white/[.06] px-4 py-4"><p className="text-xl font-extrabold text-white sm:text-2xl">{value}</p><p className="mt-1 text-[11px] font-semibold text-slate-300">{label}</p></div>; }

function IssueCard({issue,compact=false}) {
  const Icon=categoryIcon[issue.category]||Flag;
  return <Link to={`/issues/${issue.id}`} className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-card dark:border-slate-800 dark:bg-[#102235] dark:hover:border-teal-800">
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"><Icon size={19}/></div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={issue.status}/><span className="text-[11px] font-semibold text-slate-400">{issue.category}</span>{issue.slaState&&<SlaBadge state={issue.slaState}/>}</div><h3 className="mt-2 truncate font-extrabold text-navy-900 group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">{issue.title}</h3>{!compact&&<p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{issue.description}</p>}<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-400"><span className="inline-flex items-center gap-1"><MapPin size={11}/>{issue.ward_name||'Metro City'}</span><span>{formatDate(issue.created_at)}</span><span className="inline-flex items-center gap-1"><ThumbsUp size={11}/>{issue.upvotes||0}</span><span className="inline-flex items-center gap-1"><Vote size={11}/>{issue.month_votes||0}</span></div></div>
  </Link>;
}

function Explore() {
  const [filters,setFilters]=useState({category:'',status:'',wardId:'',overdue:false});
  const [view,setView]=useState('map');
  const [search,setSearch]=useState('');
  const [wards,setWards]=useState([]);
  const [issues,setIssues]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [showFilters,setShowFilters]=useState(false);
  const {notify}=useAuth();
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    const query=new URLSearchParams();
    Object.entries(filters).forEach(([key,value])=>{if(value)query.set(key==='wardId'?'wardId':key,key==='overdue'?'true':value);});
    if(search.trim())query.set('q',search.trim());
    try{const [res,meta]=await Promise.all([api(`/issues?${query}`),api('/meta')]);setIssues(res.issues);setWards(meta.wards);}
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[filters,search]);
  useEffect(()=>{refresh();},[refresh]);
  const onFilter=(key,value)=>setFilters(current=>({...current,[key]:value}));
  return <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7">
    <PageTitle eyebrow="Metro City · live map" title="Explore local issues" description="Every pin is a public report. Filter by type, status or ward to see what’s happening near you." action={<Button to="/report"><Plus size={16}/> Report an issue</Button>}/>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <label className="search-field flex-1 sm:max-w-sm"><Search size={16}/><input aria-label="Search reports" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search reports or streets"/></label>
      <div className="flex gap-2"><Button variant="secondary" className="lg:hidden" onClick={()=>setShowFilters(value=>!value)}><Filter size={15}/> Filters</Button><div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-[#102235]"><button className={cls('rounded-lg px-3 py-2 text-xs font-bold',view==='map'?'bg-navy-900 text-white':'text-slate-500')} onClick={()=>setView('map')}><Map size={14} className="mr-1 inline"/>Map</button><button className={cls('rounded-lg px-3 py-2 text-xs font-bold',view==='list'?'bg-navy-900 text-white':'text-slate-500')} onClick={()=>setView('list')}><Activity size={14} className="mr-1 inline"/>List</button></div></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
      <aside className={cls('filter-panel',showFilters?'block':'hidden lg:block')}><div className="flex items-center justify-between"><h2 className="font-extrabold">Filters</h2><button className="text-xs font-bold text-teal-700" onClick={()=>setFilters({category:'',status:'',wardId:'',overdue:false})}>Reset</button></div>
        <FilterSelect label="Category" value={filters.category} onChange={value=>onFilter('category',value)} options={categories}/>
        <FilterSelect label="Report status" value={filters.status} onChange={value=>onFilter('status',value)} options={statuses}/>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300"><input className="accent-teal-600" type="checkbox" checked={filters.overdue} onChange={event=>onFilter('overdue',event.target.checked)}/>Overdue only</label>
        {wards.length>0&&<div className="mt-5"><label className="field-label" htmlFor="ward-filter">Ward</label><select id="ward-filter" className="field-control" value={filters.wardId} onChange={event=>onFilter('wardId',event.target.value)}><option value="">All wards</option>{wards.map(ward=><option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></div>}
        <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-700"><p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Map key</p><div className="mt-3 space-y-2">{Object.entries({Reported:'bg-red-500',Acknowledged:'bg-amber-500','In Progress':'bg-blue-500',Resolved:'bg-teal-600'}).map(([label,color])=><div key={label} className="flex items-center gap-2 text-xs text-slate-500"><span className={cls('h-2.5 w-2.5 rounded-full',color)}></span>{label}</div>)}</div></div>
      </aside>
      <section>
        {error?<ErrorState message={error} retry={refresh}/>:loading?<Loading/>:view==='map'?<div className="relative h-[66vh] min-h-[480px] overflow-hidden rounded-2xl border border-slate-200 shadow-card dark:border-slate-800"><LocationMap issues={issues} interactive={false} height="100%" zoom={13}/><div className="absolute left-4 top-4 z-[500] rounded-xl bg-white/95 px-3 py-2 text-xs font-bold shadow-lg dark:bg-navy-900/95">{issues.length} reports in view</div><div className="absolute bottom-4 right-4 z-[500] max-h-[34%] w-[min(94%,360px)] space-y-2 overflow-auto rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur dark:bg-navy-900/95">{issues.slice(0,4).map(issue=><IssueCard key={issue.id} issue={issue} compact/>)}{issues.length>4&&<p className="py-1 text-center text-[10px] font-semibold text-slate-400">Select a marker or use list view for all {issues.length} reports</p>}</div></div>
        :issues.length?<div className="space-y-3">{issues.map(issue=><IssueCard key={issue.id} issue={issue}/>)}</div>:<Card><Empty icon={MapPin} title="Nothing matches these filters" detail="Try widening the map filters or be the first to report an issue." action={<Button to="/report">Report an issue</Button>}/></Card>}
      </section>
    </div>
  </div>;
}
function FilterSelect({label,value,onChange,options}) { const id=`filter-${label.toLowerCase().replaceAll(' ','-')}`;return <div className="mt-5"><label className="field-label" htmlFor={id}>{label}</label><select id={id} className="field-control" value={value} onChange={event=>onChange(event.target.value)}><option value="">All {label.toLowerCase()}s</option>{options.map(option=><option key={option}>{option}</option>)}</select></div>; }

function ReportPage() {
  const {notify}=useAuth(),navigate=useNavigate();
  const [meta,setMeta]=useState({wards:[]});
  const [form,setForm]=useState({title:'',description:'',category:'Pothole',latitude:12.9716,longitude:77.5946});
  const [photo,setPhoto]=useState(null),[preview,setPreview]=useState('');
  const [nearby,setNearby]=useState([]),[submitting,setSubmitting]=useState(false),[error,setError]=useState('');
  useEffect(()=>{api('/meta').then(setMeta).catch(e=>setError(e.message));},[]);
  useEffect(()=>{
    let active=true;
    api(`/issues/nearby?latitude=${form.latitude}&longitude=${form.longitude}&category=${encodeURIComponent(form.category)}`)
      .then(result=>{if(active)setNearby(result.issues);}).catch(()=>{if(active)setNearby([]);});
    return()=>{active=false;};
  },[form.latitude,form.longitude,form.category]);
  const pickLocation=([latitude,longitude])=>setForm(current=>({...current,latitude,longitude}));
  const locate=()=>{
    if(!navigator.geolocation){notify('This browser does not support location. Click the map to place your pin.','error');return;}
    navigator.geolocation.getCurrentPosition(position=>pickLocation([position.coords.latitude,position.coords.longitude]),
      ()=>notify('Location access was denied. Click the map to place your pin.','error'),{enableHighAccuracy:true,timeout:10000});
  };
  const submit=async event=>{
    event.preventDefault();setError('');
    const body=new FormData();
    Object.entries(form).forEach(([key,value])=>body.append(key,String(value)));
    if(photo)body.append('photo',photo);
    setSubmitting(true);
    try{const result=await api('/issues',{method:'POST',body});notify('Your report is on the public map. Thanks for speaking up.');navigate(`/issues/${result.issue.id}`);}
    catch(e){setError(e.message);}
    finally{setSubmitting(false);}
  };
  return <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-7">
    <PageTitle eyebrow="Make a public report" title="What needs fixing?" description="Give the city enough detail to act. Your report, its timeline and its outcome will be public."/>
    <form onSubmit={submit} className="grid items-start gap-5 lg:grid-cols-[1.05fr_.95fr]">
      <Card className="p-5 sm:p-7">
        {error&&<div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <Field label="Short, specific title"><input className="field-control" required minLength="5" maxLength="120" value={form.title} onChange={event=>setForm({...form,title:event.target.value})} placeholder="e.g. Deep pothole beside Central Ward bus stop"/></Field>
        <Field label="Issue category"><select className="field-control" value={form.category} onChange={event=>setForm({...form,category:event.target.value})}>{categories.map(category=><option key={category}>{category}</option>)}</select></Field>
        <Field label="What is happening?"><textarea className="field-control min-h-32 resize-y" required minLength="15" maxLength="2000" value={form.description} onChange={event=>setForm({...form,description:event.target.value})} placeholder="Describe what you see, who is affected, and any useful nearby landmark."/></Field>
        <Field label="Add a photo (optional)"><input className="field-control file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-teal-800" type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{const file=event.target.files?.[0];setPhoto(file||null);setPreview(file?URL.createObjectURL(file):'');}}/>{preview&&<img src={preview} alt="Preview of the selected issue" className="mt-3 max-h-48 rounded-xl object-cover"/>}</Field>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Posting earns <b className="text-teal-700">10 citizen points</b>.</p><Button type="submit" disabled={submitting}>{submitting?<LoaderCircle className="animate-spin" size={16}/>:<Send size={15}/>} Submit report</Button></div>
      </Card>
      <div className="space-y-4">
        <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 p-4"><div><h2 className="font-extrabold">Mark the location</h2><p className="mt-1 text-xs text-slate-500">Click the map or use your current location.</p></div><Button variant="secondary" className="px-3 py-2 text-xs" type="button" onClick={locate}><MapPin size={14}/> Use my location</Button></div><div className="h-[340px]"><LocationMap value={[form.latitude,form.longitude]} onPick={pickLocation} height="100%"/></div><div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs dark:border-slate-800"><span className="text-slate-500">{form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</span><Badge tone="teal">{meta.wards?.length?`${closestWard(meta.wards,form.latitude,form.longitude)} · auto-assigned`:'Ward assigned on submit'}</Badge></div></Card>
        {nearby.length>0&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10"><div className="flex gap-3"><Sparkles size={18} className="mt-0.5 shrink-0 text-amber-700"/><div><h3 className="text-sm font-extrabold text-amber-950 dark:text-amber-100">There’s already a report nearby</h3><p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-200/80">Within 100 m and the same category. Upvoting the existing report helps the city see local demand.</p><div className="mt-3 space-y-2">{nearby.slice(0,3).map(issue=><Link key={issue.id} to={`/issues/${issue.id}`} className="flex items-center justify-between rounded-xl bg-white/70 p-3 text-xs font-bold text-slate-800 hover:bg-white dark:bg-slate-900/50 dark:text-slate-200"><span className="truncate">{issue.title}</span><span className="ml-3 shrink-0 text-amber-800">{issue.distanceMeters} m <ArrowRight className="inline" size={12}/></span></Link>)}</div></div></div></div>}
        <p className="px-1 text-[11px] leading-5 text-slate-400">Public reports show on the Metro City map with your chosen location. Please avoid including private information in photos or descriptions.</p>
      </div>
    </form>
  </div>;
}
function closestWard(wards,lat,lng) {
  if(!wards.length)return 'Metro City';
  return wards.reduce((best,ward)=>(lat-ward.latitude)**2+(lng-ward.longitude)**2<(lat-best.latitude)**2+(lng-best.longitude)**2?ward:best).name;
}
function Field({label,children}) { return <label className="mb-5 block"><span className="field-label">{label}</span>{children}</label>; }

function IssuePage() {
  const {id}=useParams(),{user,notify}=useAuth();
  const {data,loading,error,refresh}=useResource(`/issues/${id}`,[id]);
  const [body,setBody]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer);},[]);
  const action=async(kind)=>{
    if(!user){notify('Sign in to support or vote for a report.','error');return;}
    setBusy(true);
    try{await api(`/issues/${id}/${kind}`,{method:'POST'});notify(kind==='upvote'?'You supported this report.':'Your monthly priority vote is counted.');refresh();}
    catch(e){notify(e.message,'error');}
    finally{setBusy(false);}
  };
  const addComment=async(event)=>{
    event.preventDefault();if(!body.trim())return;
    try{await api(`/issues/${id}/comments`,{method:'POST',body:{body}});setBody('');refresh();notify('Comment added to the public conversation.');}
    catch(e){notify(e.message,'error');}
  };
  if(loading)return <div className="mx-auto max-w-6xl px-5 py-10"><Loading/></div>;
  if(error)return <div className="mx-auto max-w-6xl px-5 py-10"><ErrorState message={error} retry={refresh}/></div>;
  const {issue,events,comments}=data;
  const age=Math.max(0,(now-new Date(issue.created_at).getTime())/3600000);
  return <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-7">
    <Link to="/explore" className="mb-5 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-teal-700"><ChevronRight className="rotate-180" size={14}/> Back to explore</Link>
    <div className="grid gap-5 lg:grid-cols-[1fr_350px]">
      <div className="min-w-0">
        <Card className="overflow-hidden">
          {issue.photo_path?<img src={imageUrl(issue.photo_path)} alt={`Resident photo of ${issue.title}`} className="h-64 w-full object-cover sm:h-80"/>:<div className="grid h-48 place-items-center bg-gradient-to-br from-teal-50 to-slate-100 text-teal-700 dark:from-teal-950/30 dark:to-slate-900"><MapPin size={34}/><span className="-mt-10 text-xs font-bold">Community report · Metro City</span></div>}
          <div className="p-5 sm:p-7"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={issue.status}/><Badge tone="teal">{issue.category}</Badge><SlaBadge state={issue.slaState}/></div><h1 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 dark:text-white sm:text-4xl">{issue.title}</h1><p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600 dark:text-slate-300">{issue.description}</p><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Avatar name={issue.reporter_name}/> {issue.reporter_name}</span><span className="inline-flex items-center gap-1"><MapPin size={14}/>{issue.ward_name||'Metro City'}</span><span>{formatDate(issue.created_at)}</span><span>{issue.department_name||'Unassigned'}</span></div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[[Clock3,'Time since report',formatHours(age)],[Radio,'First response',formatHours(issue.acknowledgeHours)],[CheckCircle2,'Time to resolve',formatHours(issue.resolveHours)],[ThumbsUp,'Community support',issue.upvotes||0]].map(([Icon,label,value])=><div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><Icon size={15} className="text-teal-700"/><p className="mt-2 font-extrabold text-navy-900 dark:text-white">{value}</p><p className="text-[10px] font-semibold text-slate-400">{label}</p></div>)}</div>
            <div className="mt-5 flex flex-wrap gap-2"><Button onClick={()=>action('upvote')} disabled={busy||issue.viewerUpvoted||['Resolved','Rejected'].includes(issue.status)}><ThumbsUp size={15}/> {issue.viewerUpvoted?'Supported':`Upvote · ${issue.upvotes||0}`}</Button><Button variant="secondary" onClick={()=>action('vote')} disabled={busy||issue.viewerVoted||['Resolved','Rejected'].includes(issue.status)}><Vote size={15}/> {issue.viewerVoted?'Voted this month':`Vote priority · ${issue.month_votes||0}`}</Button><Badge className="self-center text-xs">{user?'5 votes each month':'Sign in to use your monthly votes'}</Badge></div>
          </div>
        </Card>
        <Card className="mt-5 p-5 sm:p-7"><h2 className="text-lg font-extrabold">Public response timeline</h2><p className="mt-1 text-xs text-slate-500">Every status change and departmental note stays attached to this report.</p><div className="mt-6 space-y-0">{events.map((event,index)=><div key={event.id} className="relative flex gap-4 pb-6 last:pb-0"><span className={cls('timeline-line',index===events.length-1&&'last')}></span><span className={cls('relative z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white dark:ring-[#102235]',event.new_status==='Resolved'?'bg-teal-100 text-teal-700':event.new_status==='In Progress'?'bg-blue-100 text-blue-700':event.new_status==='Acknowledged'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600')}><Check size={15}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{event.new_status}</p><time className="text-[11px] text-slate-400">{new Date(event.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</time></div><p className="mt-1 text-xs text-slate-500">{event.note||`Updated by ${event.actor_name||'Metro City'}`}</p>{event.actor_name&&<p className="mt-1 text-[10px] font-semibold text-slate-400">{event.actor_name}</p>}</div></div>)}</div></Card>
        <Card className="mt-5 p-5 sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold">Neighbourhood conversation</h2><p className="mt-1 text-xs text-slate-500">{comments.length} public comments</p></div><MessageCircle className="text-teal-700" size={20}/></div><div className="mt-5 space-y-4">{comments.length?comments.map(comment=><div key={comment.id} className="flex gap-3"><Avatar name={comment.user_name}/><div className="flex-1 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70"><div className="flex items-center justify-between gap-2"><b className="text-xs">{comment.user_name}</b><span className="text-[10px] text-slate-400">{formatDate(comment.created_at,{month:'short',day:'numeric'})}</span></div><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{comment.body}</p></div></div>):<p className="text-sm text-slate-500">No comments yet. Add local context or thank a neighbour for reporting.</p>}</div>{user&&<form onSubmit={addComment} className="mt-5 flex gap-2"><input className="field-control" aria-label="Write a comment" minLength="2" maxLength="1000" value={body} onChange={event=>setBody(event.target.value)} placeholder="Add a constructive public comment"/><Button type="submit" className="shrink-0 px-3"><Send size={15}/></Button></form>}</Card>
      </div>
      <aside className="space-y-4"><Card className="overflow-hidden"><div className="h-64"><LocationMap value={[issue.latitude,issue.longitude]} interactive={false} height="100%" zoom={15}/></div><div className="p-4"><h3 className="font-extrabold">Reported location</h3><p className="mt-1 text-xs text-slate-500">{issue.ward_name||'Metro City'} · {issue.latitude.toFixed(4)}, {issue.longitude.toFixed(4)}</p></div></Card>
        <Card className="p-5"><h3 className="font-extrabold">Service commitment</h3><p className="mt-2 text-sm leading-6 text-slate-500">{issue.category} issues have a target of <b className="text-slate-700 dark:text-slate-200">{issue.slaHours} hours</b>. Time is measured from the first report to resolution.</p><div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><span className="text-xs font-semibold text-slate-500">Assigned team</span><span className="text-xs font-extrabold">{issue.department_name||'Needs assignment'}</span></div>{issue.after_photo_path&&<div className="mt-4"><p className="mb-2 text-xs font-bold">After photo</p><img src={imageUrl(issue.after_photo_path)} alt="After photo submitted by the city official" className="rounded-xl"/></div>}</Card>
      </aside>
    </div>
  </div>;
}

function Leaderboard() {
  const [period,setPeriod]=useState('month'),[kind,setKind]=useState('departments');
  const {data,loading,error,refresh}=useResource(`/leaderboard?period=${period}`,[period]);
  const rows=data?.[kind]||[];
  const chartData=rows.map(row=>({name:row.name.replace(' Department','').replace(' Ward',''),response:row.avg_response,resolve:row.avg_resolution,score:row.accountability_score,rate:row.resolution_rate}));
  const worst=[...(data?.[kind]||[])].sort((a,b)=>b.overdue-a.overdue).slice(0,3);
  const share=async()=>{try{await navigator.clipboard.writeText(`${location.origin}/leaderboard`);window.dispatchEvent(new CustomEvent('civicgaps-toast',{detail:{message:'Public leaderboard link copied.'}}));}catch{window.dispatchEvent(new CustomEvent('civicgaps-toast',{detail:{message:'Copy the page URL from your browser to share this leaderboard.',type:'error'}}));}};
  return <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-7"><PageTitle eyebrow="Public accountability · Metro City" title="Who is getting it done?" description="A transparent scorecard for every department and ward. The score weighs response speed, resolution time, resolution rate and overdue backlog." action={<Button variant="secondary" onClick={share}><ExternalLink size={15}/> Share leaderboard</Button>}/>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="segmented">{[['month','This month'],['quarter','Last 3 months'],['all','All time']].map(([value,label])=><button key={value} onClick={()=>setPeriod(value)} className={period===value?'active':''}>{label}</button>)}</div><div className="segmented">{[['departments','Departments'],['wards','Wards']].map(([value,label])=><button key={value} onClick={()=>setKind(value)} className={kind===value?'active':''}>{label}</button>)}</div></div>
    {error?<ErrorState message={error} retry={refresh}/>:loading?<Loading/>:<>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]"><div className="grid gap-4 sm:grid-cols-3">{rows.slice(0,3).map((row,index)=><Card key={row.id} className={cls('relative overflow-hidden p-5',index===0&&'border-amber-200')}><span className={cls('absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl font-black',index===0?'bg-amber-100 text-amber-700':index===1?'bg-slate-100 text-slate-600':'bg-orange-100 text-orange-700')}>{index===0?'🥇':index===1?'🥈':'🥉'}</span><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-slate-400">#{index+1} {kind==='wards'?'ward':'department'}</p><h2 className="mt-4 max-w-[78%] text-lg font-extrabold leading-tight">{row.name}</h2><div className="mt-4 flex items-end justify-between"><p className="text-4xl font-black tracking-tight text-teal-700 dark:text-teal-300">{row.accountability_score}<span className="text-base text-slate-400">/100</span></p><span className="text-right text-xs font-semibold text-slate-500">{row.resolution_rate}%<br/>resolved</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-teal-500" style={{width:`${row.accountability_score}%`}}/></div><p className="mt-3 text-[11px] text-slate-500">{row.total} reports · {row.overdue} overdue</p></Card>)}</div>
        <Card className="border-red-100 bg-red-50/50 p-5 dark:border-red-900/30 dark:bg-red-950/10"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-red-100 text-red-700"><ArrowDownRight size={17}/></span><div><p className="text-sm font-extrabold text-red-900 dark:text-red-200">Backlog to watch</p><p className="text-[10px] font-semibold text-red-700/70 dark:text-red-300/70">Most overdue reports</p></div></div><div className="mt-4 space-y-3">{worst.map((row,index)=><div key={row.id} className="flex items-center justify-between border-b border-red-100 pb-3 last:border-0 dark:border-red-900/30"><span className="text-xs font-bold">{index+1}. {row.name}</span><Badge tone="red">{row.overdue} overdue</Badge></div>)}</div><p className="mt-1 text-[10px] leading-4 text-red-800/70 dark:text-red-300/70">This is a public service backlog view—not a ranking of individual staff.</p></Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><Card className="p-5"><div className="mb-4"><h2 className="font-extrabold">Average response time</h2><p className="mt-1 text-xs text-slate-500">Hours between report and first acknowledgement. Lower is faster.</p></div><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{top:8,right:8,left:-20,bottom:15}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef0"/><XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={54} tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="response" name="Response hours" fill="#0e9f91" radius={[6,6,0,0]} maxBarSize={40}/></BarChart></ResponsiveContainer></div></Card>
        <Card className="p-5"><div className="mb-4"><h2 className="font-extrabold">Reports over time</h2><p className="mt-1 text-xs text-slate-500">Monthly reports received and issues resolved.</p></div><div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={data?.trend||[]} margin={{top:8,right:8,left:-20,bottom:8}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8eef0"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Line type="monotone" dataKey="reported" name="Reported" stroke="#0e9f91" strokeWidth={3} dot={false}/><Line type="monotone" dataKey="resolved" name="Resolved" stroke="#f59e0b" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></div></Card></div>
      <Card className="mt-5 overflow-hidden"><div className="border-b border-slate-100 p-5 dark:border-slate-800"><h2 className="font-extrabold">{kind==='departments'?'Department scorecard':'Ward scorecard'}</h2><p className="mt-1 text-xs text-slate-500">Sorted by Accountability Score. SLA overdue counts update against issue category targets.</p></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Rank & name</th><th>Score</th><th>Avg. response</th><th>Avg. resolution</th><th>Resolution rate</th><th>Overdue</th></tr></thead><tbody>{rows.map((row,index)=><tr key={row.id}><td><b className="mr-2 text-slate-400">#{index+1}</b><b>{row.name}</b></td><td><span className="font-extrabold text-teal-700">{row.accountability_score}</span></td><td>{row.avg_response} hrs</td><td>{row.avg_resolution} hrs</td><td>{row.resolution_rate}%</td><td><Badge tone={row.overdue?'red':'green'}>{row.overdue}</Badge></td></tr>)}</tbody></table></div><p className="border-t border-slate-100 px-5 py-3 text-[10px] leading-5 text-slate-400 dark:border-slate-800">Formula: 25% response speed (100 − average response hours ÷ 2) + 25% resolution speed (100 − average resolution hours ÷ 12) + 40% resolution rate + 10% SLA compliance (1 − overdue ÷ total). Each component is clamped from 0 to 100. Empty performance history is neutral (50).</p></Card>
    </>}</div>;
}

function Priorities() {
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[tick,setTick]=useState(Date.now());
  const {user,notify}=useAuth();
  const refresh=useCallback(async()=>{setLoading(true);setError('');try{setData(await api('/priorities'));}catch(e){setError(e.message);}finally{setLoading(false);}},[]);
  useEffect(()=>{refresh();const id=setInterval(()=>setTick(Date.now()),60000);return()=>clearInterval(id);},[refresh]);
  const vote=async(issueId)=>{try{await api(`/issues/${issueId}/vote`,{method:'POST'});notify('Your priority vote is counted.');refresh();}catch(e){notify(e.message,'error');}};
  const end=new Date(new Date().getFullYear(),new Date().getMonth()+1,1);
  const days=Math.max(0,Math.ceil((end-tick)/86400000));
  return <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-7"><PageTitle eyebrow="Monthly community vote" title="What should move first?" description="Five votes per resident, every month. Open issues with the strongest community support rise to the top of the city’s priority queue." action={<div className="rounded-2xl bg-navy-900 px-5 py-3 text-center text-white"><p className="text-2xl font-black">{days}<span className="ml-1 text-xs font-bold">days</span></p><p className="text-[10px] font-semibold text-slate-300">until the month closes</p></div>}/>
    {user&&<div className="mb-5 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900 dark:border-teal-900/40 dark:bg-teal-900/10 dark:text-teal-100"><Vote className="mr-2 inline" size={16}/> You have used <b>{data?.votesUsed??'—'} of 5</b> priority votes this month. Each issue gets one vote from you.</div>}
    {error?<ErrorState message={error} retry={refresh}/>:loading?<Loading/>:data?.issues?.length?<div className="grid gap-5 lg:grid-cols-[1fr_300px]"><div className="space-y-3">{data.issues.map((issue,index)=><Card key={issue.id} className="flex items-center gap-4 p-4 sm:p-5"><span className={cls('grid h-11 w-11 shrink-0 place-items-center rounded-xl font-black',index===0?'bg-amber-100 text-amber-800':index===1?'bg-slate-100 text-slate-700':'bg-slate-50 text-slate-500')}>#{index+1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={issue.status}/><Badge tone="teal">{issue.category}</Badge></div><Link to={`/issues/${issue.id}`} className="mt-2 block truncate font-extrabold hover:text-teal-700">{issue.title}</Link><p className="mt-1 text-xs text-slate-500">{issue.ward_name} · {issue.month_votes} monthly votes · {issue.upvotes} upvotes</p></div><Button variant="secondary" className="shrink-0 px-3" disabled={!user||issue.viewerVoted||data.votesUsed>=5||['Resolved','Rejected'].includes(issue.status)} onClick={()=>vote(issue.id)}><Vote size={15}/>{issue.viewerVoted?' Voted': ' Vote'}</Button></Card>)}</div>
      <aside className="space-y-4"><Card className="p-5"><Trophy className="text-amber-500" size={22}/><h2 className="mt-4 font-extrabold">How the queue works</h2><ol className="mt-3 space-y-3 text-xs leading-5 text-slate-500"><li><b className="text-teal-700">1.</b> Every citizen gets five votes each calendar month.</li><li><b className="text-teal-700">2.</b> A vote can only be used once on an open report.</li><li><b className="text-teal-700">3.</b> Officials see this same queue, sorted by citizen support.</li><li><b className="text-teal-700">4.</b> Votes reset at the start of the next month.</li></ol></Card><Card className="p-5"><h3 className="font-extrabold">Queue integrity</h3><p className="mt-2 text-xs leading-5 text-slate-500">The server enforces each monthly limit and prevents duplicate votes. Resolved and rejected reports can no longer receive votes.</p></Card></aside></div>:<Card><Empty icon={Vote} title="No open reports to vote on" detail="New community reports will appear here as soon as residents submit them."/></Card>}
  </div>;
}

function MyReports() {
  const {data,loading,error,refresh}=useResource('/issues?mine=true&limit=200');
  const issues=data?.issues||[];
  return <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-7"><PageTitle eyebrow="Your civic footprint" title="My reports" description="Follow the status, department response and community support for every issue you have raised." action={<Button to="/report"><Plus size={15}/> New report</Button>}/>
    {error?<ErrorState message={error} retry={refresh}/>:loading?<Loading/>:issues.length?<><div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard icon={Flag} label="Reports submitted" value={issues.length}/><StatCard icon={CheckCircle2} label="Resolved" value={issues.filter(i=>i.status==='Resolved').length} accent="blue"/><StatCard icon={Clock3} label="Still open" value={issues.filter(i=>!['Resolved','Rejected'].includes(i.status)).length} accent="amber"/></div><div className="space-y-3">{issues.map(issue=><IssueCard key={issue.id} issue={issue}/>)}</div></>:<Card><Empty icon={Flag} title="No reports yet" detail="When you report a local issue, it will appear here with its public response timeline." action={<Button to="/report">Report your first issue</Button>}/></Card>}</div>;
}

function NotificationsPage() {
  const {data,loading,error,refresh}=useResource('/notifications');
  return <div className="mx-auto max-w-3xl px-4 py-8 sm:px-7"><PageTitle eyebrow="Your inbox" title="Notifications" description="Status changes on reports you filed, upvoted or voted for." action={data?.unread>0&&<Button variant="secondary" onClick={async()=>{await api('/notifications/read-all',{method:'PATCH'});refresh();}}>Mark all read</Button>}/>
    {error?<ErrorState message={error} retry={refresh}/>:loading?<Loading/>:data?.notifications?.length?<div className="space-y-2">{data.notifications.map(item=><Link key={item.id} to={item.issue_id?`/issues/${item.issue_id}`:'#'} className={cls('flex gap-3 rounded-2xl border p-4 transition hover:border-teal-200',item.is_read?'border-slate-200 bg-white dark:border-slate-800 dark:bg-[#102235]':'border-teal-200 bg-teal-50/50 dark:border-teal-900/50 dark:bg-teal-950/10')}><span className={cls('mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl',item.is_read?'bg-slate-100 text-slate-500':'bg-teal-100 text-teal-800')}><Bell size={16}/></span><div className="flex-1"><p className="text-sm font-bold">{item.message}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</p></div>{!item.is_read&&<span className="mt-2 h-2 w-2 rounded-full bg-teal-600"/>}</Link>)}</div>:<Card><Empty icon={Bell} title="No notifications yet" detail="Updates to reports you follow will appear here."/></Card>}</div>;
}

function Profile() {
  const {data,loading,error,refresh}=useResource('/profile');
  const citizens=useResource('/leaderboard/citizens');
  return <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-7"><PageTitle eyebrow="Citizen profile" title="Your local impact" description="Every report, upvote and priority vote helps build a clearer picture of what your neighbourhood needs."/>
    {error?<ErrorState message={error} retry={refresh}/>:loading?<Loading/>:<><Card className="flex flex-wrap items-center gap-5 p-6"><Avatar name={data.user.name} size="lg"/><div className="min-w-[220px] flex-1"><h2 className="text-2xl font-extrabold">{data.user.name}</h2><p className="mt-1 text-sm text-slate-500">{data.user.email} · Metro City resident</p><div className="mt-3 flex flex-wrap gap-2">{data.badges.map(badge=><Badge key={badge} tone="teal"><Award size={12}/>{badge}</Badge>)}</div></div><div className="rounded-2xl bg-teal-50 px-5 py-4 text-center dark:bg-teal-900/20"><p className="text-3xl font-black text-teal-800 dark:text-teal-300">{data.points}</p><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">citizen points</p></div></Card>
      <div className="mt-5 grid gap-4 sm:grid-cols-3"><StatCard icon={Flag} label="Reports submitted" value={data.reports}/><StatCard icon={CheckCircle2} label="Reports resolved" value={data.resolved} accent="blue"/><StatCard icon={Users} label="Community contributor" value={data.points>=100?'City Guardian':data.points>=50?'Neighbourhood Hero':data.points>=20?'Active Citizen':'Newcomer'} accent="amber"/></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]"><Card className="overflow-hidden"><div className="border-b border-slate-100 p-5 dark:border-slate-800"><h2 className="font-extrabold">Citizen leaderboard</h2><p className="mt-1 text-xs text-slate-500">Recognition for residents who keep showing up.</p></div>{citizens.loading?<Loading/>:citizens.error?<p className="p-5 text-sm text-red-700">{citizens.error}</p>:<div className="divide-y divide-slate-100 dark:divide-slate-800">{(citizens.data?.citizens||[]).map((person,index)=><div key={person.id} className="flex items-center gap-3 px-5 py-3"><span className="w-6 text-xs font-extrabold text-slate-400">#{index+1}</span><Avatar name={person.name}/><span className="flex-1 text-sm font-bold">{person.name}</span><span className="text-xs font-extrabold text-teal-700">{person.points} pts</span></div>)}</div>}</Card><Card className="p-5"><h2 className="font-extrabold">How to level up</h2><div className="mt-4 space-y-3">{[['Newcomer','Get started','0+'],['Active Citizen','Stay involved','20+'],['Neighbourhood Hero','Build momentum','50+'],['City Guardian','Lead by example','100+']].map(([badge,tip,pts])=><div key={badge} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70"><div><p className="text-xs font-extrabold">{badge}</p><p className="text-[10px] text-slate-500">{tip}</p></div><Badge tone="teal">{pts} pts</Badge></div>)}</div><p className="mt-4 text-[10px] leading-4 text-slate-400">+10 for a report · +25 when your report is resolved · +1 for an upvote · +2 for a priority vote.</p></Card></div></>}</div>;
}

function Dashboard() {
  const {user}=useAuth();
  if(user?.role==='citizen')return <CitizenDashboard/>;
  return <OfficialDashboard admin={user?.role==='admin'}/>;
}
function CitizenDashboard() {
  const reports=useResource('/issues?mine=true&limit=200');
  const priorities=useResource('/priorities');
  return <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-7"><PageTitle eyebrow="Resident dashboard" title="Your neighbourhood, at a glance" description="Keep up with the reports you’ve made and the issues your community is prioritizing." action={<Button to="/report"><Plus size={15}/> Report issue</Button>}/>
    <div className="grid gap-4 sm:grid-cols-3"><StatCard icon={Flag} label="Your reports" value={reports.data?.issues?.length??'—'}/><StatCard icon={CheckCircle2} label="Resolved" value={reports.data?.issues?.filter(i=>i.status==='Resolved').length??'—'} accent="blue"/><StatCard icon={Vote} label="Top priority this month" value={priorities.data?.issues?.[0]?.month_votes??'—'} accent="amber"/></div>
    <div className="mt-6 grid gap-5 lg:grid-cols-2"><Card className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-extrabold">Latest reports</h2><Link to="/my-reports" className="text-xs font-bold text-teal-700">All reports <ArrowRight className="inline" size={13}/></Link></div>{reports.loading?<Loading/>:reports.error?<ErrorState message={reports.error} retry={reports.refresh}/>:reports.data.issues.length?<div className="space-y-2">{reports.data.issues.slice(0,3).map(issue=><IssueCard key={issue.id} issue={issue} compact/>)}</div>:<Empty icon={Flag} title="No reports yet" detail="Be the first to flag an issue in your area." action={<Button to="/report">Make a report</Button>}/>}</Card>
      <Card className="p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-extrabold">Citizen priority queue</h2><Link to="/priorities" className="text-xs font-bold text-teal-700">Vote now <ArrowRight className="inline" size={13}/></Link></div>{priorities.loading?<Loading/>:priorities.error?<ErrorState message={priorities.error} retry={priorities.refresh}/>:<div className="space-y-3">{(priorities.data.issues||[]).slice(0,4).map((issue,index)=><Link key={issue.id} to={`/issues/${issue.id}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 hover:bg-teal-50 dark:bg-slate-800/70 dark:hover:bg-slate-800"><span className="font-black text-teal-700">#{index+1}</span><span className="min-w-0 flex-1 truncate text-sm font-bold">{issue.title}</span><Badge tone="teal"><Vote size={11}/>{issue.month_votes}</Badge></Link>)}</div>}</Card></div>
  </div>;
}
function OfficialDashboard({admin}) {
  const {notify}=useAuth();
  const [issues,setIssues]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [meta,setMeta]=useState({departments:[],wards:[]}),[notes,setNotes]=useState({}),[departmentId,setDepartmentId]=useState('');
  const [status,setStatus]=useState({});
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{const [data,metadata]=await Promise.all([api(`/official/queue${admin&&departmentId?`?departmentId=${departmentId}`:''}`),api('/meta')]);setIssues(data.issues);setMeta(metadata);}
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  },[admin,departmentId]);
  useEffect(()=>{refresh();},[refresh]);
  const counts=useMemo(()=>({open:issues.length,overdue:issues.filter(issue=>issue.slaState==='overdue').length,votes:issues.reduce((sum,item)=>sum+(item.month_votes||0),0)}),[issues]);
  const update=async(event,issue)=>{
    event.preventDefault();
    const next=status[issue.id]||'Acknowledged';
    const body=new FormData();body.append('status',next);body.append('note',notes[issue.id]||'Department review completed and next steps recorded.');
    const photo=event.currentTarget.querySelector('input[type=file]')?.files?.[0];if(photo)body.append('afterPhoto',photo);
    try{await api(`/issues/${issue.id}/status`,{method:'PATCH',body});setStatus(current=>{const copy={...current};delete copy[issue.id];return copy;});setNotes(current=>({...current,[issue.id]:''}));notify(`Report moved to ${next}. Followers have been notified.`);refresh();}
    catch(e){notify(e.message,'error');}
  };
  return <div className="mx-auto max-w-[1320px] px-4 py-8 sm:px-7"><PageTitle eyebrow={admin?'City administration':'Department workspace'} title={admin?'Citywide operations':'Your service queue'} description={admin?'Review reports across Metro City, compare department workloads and reassign issues.':'Citizen priorities and overdue service requests, together in one working queue.'} action={admin&&<select className="field-control !w-auto" value={departmentId} onChange={event=>setDepartmentId(event.target.value)}><option value="">All departments</option>{meta.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}/>
    <div className="grid gap-4 sm:grid-cols-3"><StatCard icon={Activity} label="Open assigned reports" value={counts.open} accent="blue"/><StatCard icon={Clock3} label="Overdue against SLA" value={counts.overdue} accent="red"/><StatCard icon={Vote} label="Community priority votes" value={counts.votes} accent="amber"/></div>
    {admin&&<AdminCatalog meta={meta} refresh={refresh} notify={notify}/>}
    <Card className="mt-6 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800"><div><h2 className="font-extrabold">{admin?'Citywide issue queue':'Citizen Priority Queue'}</h2><p className="mt-1 text-xs text-slate-500">{admin?'All departments, ranked by monthly community votes.':'Sorted by monthly priority votes, then by report age.'}</p></div><Button variant="secondary" onClick={refresh}><Activity size={15}/> Refresh</Button></div>
      {error?<div className="p-5"><ErrorState message={error} retry={refresh}/></div>:loading?<Loading/>:issues.length?<div className="divide-y divide-slate-100 dark:divide-slate-800">{issues.map(issue=><div key={issue.id} className="grid gap-4 p-5 xl:grid-cols-[1fr_270px]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={issue.status}/><Badge tone="teal">{issue.category}</Badge><SlaBadge state={issue.slaState}/></div><Link to={`/issues/${issue.id}`} className="mt-2 block font-extrabold hover:text-teal-700">{issue.title}</Link><p className="mt-1 line-clamp-2 text-xs text-slate-500">{issue.description}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-400"><span>{issue.ward_name}</span><span>{issue.reporter_name}</span><span>{formatDate(issue.created_at)}</span><span>{issue.month_votes} priority votes</span><span>{issue.department_name}</span></div>{admin&&<div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs font-semibold text-slate-500" htmlFor={`assign-${issue.id}`}>Assign department:</label><select id={`assign-${issue.id}`} className="field-control !w-auto !py-1.5 !text-xs" value={issue.department_id||''} onChange={async event=>{try{await api(`/admin/issues/${issue.id}/assign`,{method:'PATCH',body:{departmentId:Number(event.target.value)}});notify('Issue reassigned.');refresh();}catch(e){notify(e.message,'error');}}}>{meta.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>}</div>
        <form className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60" onSubmit={event=>update(event,issue)}><label className="field-label" htmlFor={`status-${issue.id}`}>Update status</label><select id={`status-${issue.id}`} className="field-control !mb-2" value={status[issue.id]||nextStatuses[issue.status]?.[0]||issue.status} onChange={event=>setStatus(current=>({...current,[issue.id]:event.target.value}))}>{(nextStatuses[issue.status]||[]).map(s=><option key={s}>{s}</option>)}</select><textarea className="field-control !mb-2 min-h-16 text-xs" minLength="5" maxLength="500" required value={notes[issue.id]||''} onChange={event=>setNotes(current=>({...current,[issue.id]:event.target.value}))} placeholder="Public progress note (required)"/><input className="mb-2 block w-full text-[10px] text-slate-500" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Optional after photo"/><Button className="w-full !py-2 text-xs"><CheckCircle2 size={13}/> Save public update</Button></form>
      </div>)}</div>:<Empty icon={CheckCircle2} title="Your queue is clear" detail="New open reports assigned to your department will appear here."/>}
    </Card>
  </div>;
}

function AdminCatalog({meta,refresh,notify}) {
  const [department,setDepartment]=useState({name:'',description:''});
  const [ward,setWard]=useState({name:'',latitude:'12.9716',longitude:'77.5946'});
  const [busy,setBusy]=useState(false);
  const addDepartment=async event=>{
    event.preventDefault();setBusy(true);
    try{await api('/admin/departments',{method:'POST',body:department});setDepartment({name:'',description:''});notify('Department added.');refresh();}
    catch(e){notify(e.message,'error');}
    finally{setBusy(false);}
  };
  const addWard=async event=>{
    event.preventDefault();setBusy(true);
    try{await api('/admin/wards',{method:'POST',body:{...ward,latitude:Number(ward.latitude),longitude:Number(ward.longitude)}});setWard({name:'',latitude:'12.9716',longitude:'77.5946'});notify('Ward added.');refresh();}
    catch(e){notify(e.message,'error');}
    finally{setBusy(false);}
  };
  return <Card className="mt-6 overflow-hidden"><details><summary className="cursor-pointer list-none border-b border-slate-100 p-5 dark:border-slate-800"><span className="font-extrabold">Manage departments &amp; wards</span><span className="ml-2 text-xs text-slate-500">Edit service teams, ward names and map centers</span></summary>
    <div className="grid gap-5 p-5 lg:grid-cols-2">
      <div><h3 className="mb-3 text-sm font-extrabold">Departments <span className="text-slate-400">({meta.departments.length})</span></h3><div className="space-y-2">{meta.departments.map(item=><CatalogRow key={item.id} item={item} type="departments" refresh={refresh} notify={notify}/>)}</div><form onSubmit={addDepartment} className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><p className="mb-2 text-xs font-extrabold">Add department</p><input className="field-control !mb-2" required minLength="2" maxLength="80" aria-label="New department name" placeholder="Department name" value={department.name} onChange={event=>setDepartment({...department,name:event.target.value})}/><input className="field-control !mb-2" maxLength="250" aria-label="Department description" placeholder="Service description" value={department.description} onChange={event=>setDepartment({...department,description:event.target.value})}/><Button disabled={busy} className="!py-2 text-xs"><Plus size={13}/> Add department</Button></form></div>
      <div><h3 className="mb-3 text-sm font-extrabold">Wards <span className="text-slate-400">({meta.wards.length})</span></h3><div className="max-h-80 space-y-2 overflow-auto">{meta.wards.map(item=><CatalogRow key={item.id} item={item} type="wards" refresh={refresh} notify={notify}/>)}</div><form onSubmit={addWard} className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><p className="mb-2 text-xs font-extrabold">Add ward</p><input className="field-control !mb-2" required minLength="2" maxLength="80" aria-label="New ward name" placeholder="Ward name" value={ward.name} onChange={event=>setWard({...ward,name:event.target.value})}/><div className="mb-2 grid grid-cols-2 gap-2"><input className="field-control" required type="number" step="any" min="-90" max="90" aria-label="Ward latitude" placeholder="Latitude" value={ward.latitude} onChange={event=>setWard({...ward,latitude:event.target.value})}/><input className="field-control" required type="number" step="any" min="-180" max="180" aria-label="Ward longitude" placeholder="Longitude" value={ward.longitude} onChange={event=>setWard({...ward,longitude:event.target.value})}/></div><Button disabled={busy} className="!py-2 text-xs"><Plus size={13}/> Add ward</Button></form></div>
    </div>
  </details></Card>;
}
function CatalogRow({item,type,refresh,notify}) {
  const [values,setValues]=useState({name:item.name,description:item.description||'',latitude:String(item.latitude||''),longitude:String(item.longitude||'')});
  const [busy,setBusy]=useState(false);
  const save=async event=>{
    event.preventDefault();setBusy(true);
    const body=type==='wards'?{name:values.name,latitude:Number(values.latitude),longitude:Number(values.longitude)}:{name:values.name,description:values.description};
    try{await api(`/admin/${type}/${item.id}`,{method:'PATCH',body});notify(`${type==='wards'?'Ward':'Department'} updated.`);refresh();}
    catch(e){notify(e.message,'error');}
    finally{setBusy(false);}
  };
  return <form onSubmit={save} className="grid gap-2 rounded-xl border border-slate-100 p-3 dark:border-slate-700 sm:grid-cols-[1fr_auto]"><div className="grid gap-2 sm:grid-cols-2"><input className="field-control !py-2 !text-xs" required minLength="2" maxLength="80" aria-label={`${item.name} name`} value={values.name} onChange={event=>setValues({...values,name:event.target.value})}/>{type==='departments'?<input className="field-control !py-2 !text-xs" maxLength="250" aria-label={`${item.name} description`} value={values.description} onChange={event=>setValues({...values,description:event.target.value})}/>:<div className="grid grid-cols-2 gap-2"><input className="field-control !py-2 !text-xs" required type="number" step="any" aria-label={`${item.name} latitude`} value={values.latitude} onChange={event=>setValues({...values,latitude:event.target.value})}/><input className="field-control !py-2 !text-xs" required type="number" step="any" aria-label={`${item.name} longitude`} value={values.longitude} onChange={event=>setValues({...values,longitude:event.target.value})}/></div>}</div><Button variant="secondary" disabled={busy} className="!py-2 text-xs">Save</Button></form>;
}

function AuthPage({register=false}) {
  const {signIn,register:signup,notify}=useAuth(),navigate=useNavigate();
  const [form,setForm]=useState({name:'',email:'',password:''}),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const submit=async event=>{
    event.preventDefault();setError('');setLoading(true);
    try{const user=register?await signup(form):await signIn(form);notify(register?'Welcome to the neighbourhood.':'Welcome back.');navigate(user.role==='citizen'?'/dashboard':'/dashboard');}
    catch(e){setError(e.message);}
    finally{setLoading(false);}
  };
  return <div className="mx-auto grid min-h-[calc(100vh-140px)] max-w-[1000px] items-center gap-8 px-4 py-10 sm:px-7 lg:grid-cols-[.85fr_1.15fr]"><div className="hidden rounded-[28px] bg-navy-900 p-9 text-white lg:block"><MapPin className="text-teal-300" size={28}/><h2 className="mt-6 text-3xl font-black leading-tight">A better city starts with a report.</h2><p className="mt-4 text-sm leading-7 text-slate-300">Join your neighbours in bringing local issues into the open—and keeping the response on the record.</p><div className="mt-8 flex gap-2">{[1,2,3].map(v=><span key={v} className="h-1.5 flex-1 rounded-full bg-teal-500/70"/>)}<span className="h-1.5 flex-1 rounded-full bg-white/15"/></div><p className="mt-2 text-[10px] text-slate-400">Metro City · 8 wards · one shared public record</p></div>
    <Card className="mx-auto w-full max-w-[500px] p-6 sm:p-9"><p className="eyebrow">{register?'Join the city conversation':'Good to have you back'}</p><h1 className="mt-2 text-3xl font-extrabold">{register?'Create your account':'Sign in to CivicGaps'}</h1><p className="mt-2 text-sm text-slate-500">{register?'Start reporting and supporting local improvements.':'Pick up where your neighbourhood left off.'}</p>
      {error&&<p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form className="mt-6" onSubmit={submit}>{register&&<Field label="Your name"><input className="field-control" required minLength="2" maxLength="80" autoComplete="name" value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Asha Rao"/></Field>}<Field label="Email address"><input className="field-control" required type="email" autoComplete="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="you@example.com"/></Field><Field label="Password"><input className="field-control" required type="password" minLength="6" autoComplete={register?'new-password':'current-password'} value={form.password} onChange={event=>setForm({...form,password:event.target.value})} placeholder="At least 6 characters"/></Field><Button className="mt-1 w-full" disabled={loading}>{loading?<LoaderCircle className="animate-spin" size={16}/>:<LogIn size={16}/>} {register?'Create account':'Sign in'}</Button></form>
      <p className="mt-5 text-center text-sm text-slate-500">{register?'Already registered?':'New to CivicGaps?'} <Link className="font-bold text-teal-700" to={register?'/login':'/register'}>{register?'Sign in':'Create an account'}</Link></p>
      {!register&&<div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-800/70"><b className="text-slate-700 dark:text-slate-200">Presentation demo</b><br/>Use the floating Demo Mode panel to switch between resident, official and admin accounts.</div>}
    </Card></div>;
}

function DemoPanel() {
  const {user,signIn,notify}=useAuth();
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const login=async(role)=>{
    const creds={citizen:['citizen@demo.com','Resident'],official:['official@demo.com','Official'],admin:['admin@demo.com','Administrator']}[role];
    setBusy(true);
    try{await signIn({email:creds[0],password:'demo123'});notify(`Demo ${creds[1]} session is ready.`);}
    catch(e){notify(e.message,'error');}
    finally{setBusy(false);}
  };
  const simulate=async()=>{
    setBusy(true);
    try{
      if(user?.role!=='official')await signIn({email:'official@demo.com',password:'demo123'});
      const {issues}=await api('/official/queue');
      const issue=issues.find(item=>item.reporter_name==='Asha Rao')||issues[0];
      if(!issue)throw new Error('No open assigned reports are available to update.');
      const next=nextStatuses[issue.status]?.[0];
      if(!next)throw new Error('The demo report is already closed.');
      const body=new FormData();body.append('status',next);body.append('note',`A field crew has been assigned after resident follow-up. Status moved to ${next}.`);
      await api(`/issues/${issue.id}/status`,{method:'PATCH',body});
      notify(`Live demo: “${issue.title}” is now ${next}.`);
    }catch(e){notify(e.message,'error');}
    finally{setBusy(false);}
  };
  return <div className="fixed bottom-4 right-4 z-[1200]"><div className={cls('demo-panel',open?'':'hidden')}><div className="flex items-center justify-between"><div><p className="flex items-center gap-1.5 text-sm font-extrabold text-white"><Sparkles size={15} className="text-teal-300"/> Demo Mode</p><p className="mt-1 text-[10px] text-slate-400">One-click roles · password demo123</p></div><button aria-label="Close demo panel" className="text-slate-400 hover:text-white" onClick={()=>setOpen(false)}><X size={17}/></button></div>
    <div className="mt-4 grid grid-cols-3 gap-2">{[['citizen','Citizen'],['official','Official'],['admin','Admin']].map(([role,label])=><button disabled={busy} key={role} onClick={()=>login(role)} className={cls('rounded-lg border px-2 py-2 text-[11px] font-bold transition',user?.role===role?'border-teal-500 bg-teal-500/20 text-teal-100':'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10')}>{label}</button>)}</div>
    <button disabled={busy} onClick={simulate} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-3 py-2.5 text-xs font-extrabold text-white hover:bg-teal-400 disabled:opacity-60">{busy?<LoaderCircle size={14} className="animate-spin"/>:<Radio size={14}/>}Simulate live status update</button><p className="mt-2 text-center text-[9px] text-slate-500">Open a resident window to see the instant notification.</p></div>
    <button onClick={()=>setOpen(value=>!value)} className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-navy-900 px-4 py-3 text-xs font-extrabold text-white shadow-xl shadow-navy-950/25 transition hover:bg-navy-800"><Sparkles size={15} className="text-teal-300"/> Demo Mode <ChevronDown size={14} className={open?'rotate-180':''}/></button></div>;
}

function Toast() {
  const {toast}=useAuth();
  const [custom,setCustom]=useState(null);
  useEffect(()=>{const receive=event=>{setCustom(event.detail);setTimeout(()=>setCustom(null),3500);};window.addEventListener('civicgaps-toast',receive);return()=>window.removeEventListener('civicgaps-toast',receive);},[]);
  const item=custom||toast;
  if(!item)return null;
  return <motion.div initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} className={cls('toast-message',item.type==='error'?'border-red-200':'border-teal-200')}><span className={cls('grid h-8 w-8 place-items-center rounded-full',item.type==='error'?'bg-red-100 text-red-700':'bg-teal-100 text-teal-700')}>{item.type==='error'?<X size={15}/>:<Check size={15}/>}</span><p className="flex-1 text-sm font-semibold">{item.message}</p></motion.div>;
}

function NotFound() { return <div className="mx-auto max-w-xl px-5 py-24 text-center"><MapPin className="mx-auto text-teal-700" size={28}/><h1 className="mt-4 text-3xl font-black">That page is off the map.</h1><p className="mt-2 text-sm text-slate-500">The link may have changed, but the city is still here.</p><Button to="/explore" className="mt-6"><Map size={15}/> Explore reports</Button></div>; }

export default function App() { return <AuthProvider><AppShell/></AuthProvider>; }
