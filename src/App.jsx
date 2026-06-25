import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LayoutDashboard, Calendar as CalendarIcon, CalendarDays, StickyNote, Timer,
  History as HistoryIcon, BarChart3, Target, Settings as SettingsIcon,
  Plus, Search, X, Check, Trash2, Pencil, ChevronLeft, ChevronRight,
  Play, Pause, RotateCcw, Sun, Moon, Flame, Sparkles, Bell, Menu,
  Clock, AlertTriangle, CheckCircle2, Circle, TrendingUp,
  Volume2, VolumeX, User, LogOut, Award, ListChecks, Zap, ArrowRight
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

/* ============================================================================
   FIREBASE CLIENT
   Paste your Firebase project config below (Firebase Console → Project
   Settings → General → "Your apps" → SDK setup and configuration → Config).
   It's a single object — copy it exactly as Firebase gives it to you.
============================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyDpzD5KWVL4AbH8fl4qX3dmzg8Z2LCZiZk",
  authDomain: "tasksphere-6d210.firebaseapp.com",
  projectId: "tasksphere-6d210",
  storageBucket: "tasksphere-6d210.firebasestorage.app",
  messagingSenderId: "509020362124",
  appId: "1:509020362124:web:52d8815d3e70c88aa8b2a9",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

/* ============================================================================
   TASKSPHERE — Plan. Focus. Achieve.
   Premium SaaS productivity platform. Light theme edition.
============================================================================ */

/* ---------------------------------- 1. Helpers ---------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayDiff = (aISO, bISO) => {
  const a = new Date(aISO + "T00:00:00");
  const b = new Date(bISO + "T00:00:00");
  return Math.round((b - a) / 86400000);
};
const fmtDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtDateFull = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const startOfWeek = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
};

const PRIORITY_META = {
  High: { color: "#EF4444", bg: "rgba(239,68,68,0.10)", label: "High" },
  Medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)", label: "Medium" },
  Low: { color: "#10B981", bg: "rgba(16,185,129,0.10)", label: "Low" },
};

const CATEGORY_OPTIONS = ["Work", "Personal", "Study", "Health", "Finance", "Errands"];

const QUOTES = [
  "Small steps, repeated daily, outrun sporadic leaps.",
  "Discipline is choosing between what you want now and what you want most.",
  "Clarity comes from action, not thought.",
  "Done is the engine of more.",
  "Focus on the next right action, not the whole mountain.",
  "Progress is quiet. Trust it.",
  "Your future is built in the next 25 minutes.",
  "Consistency compounds when motivation doesn't.",
];

function quoteOfDay() {
  const day = Math.floor(Date.now() / 86400000);
  return QUOTES[day % QUOTES.length];
}

/* ---------------------------------- Workspace store (Firebase) ---------------------------------- */
// Persisted workspace registry backed by Firestore.
// Each workspace is ONE document at collection "workspaces", doc id = lowercase username.
// The document holds settings + aggregate fields AND the tasks/notes/goals/history
// arrays directly (Firestore documents can hold nested arrays/objects up to 1MB,
// which is far more than this app's data will ever reach).

function defaultWorkspaceDoc(username) {
  return {
    username: username.toLowerCase(),
    displayName: username,
    createdAt: todayISO(),
    tasks: [],
    notes: [],
    goals: [],
    history: [],
    pomodoroStats: { daily: 0, weekly: 0, total: 0 },
    streak: 0,
    lastCompletionDate: null,
    theme: "light",
    soundOn: true,
    volume: 70,
    notifPrefs: { taskCompleted: true, dueSoon: true, overdue: true, weeklyReview: true },
  };
}

// Fetches a full workspace (settings + tasks + notes + goals + history) by username.
// Returns null if no workspace document exists for that username.
async function getWorkspace(username) {
  const key = username.trim().toLowerCase();
  if (!key) return null;

  const snap = await getDoc(doc(db, "workspaces", key));
  if (!snap.exists()) return null;
  const w = snap.data();

  return {
    username: w.displayName || w.username,
    tasks: w.tasks || [],
    history: w.history || [],
    notes: w.notes || [],
    goals: w.goals || [],
    pomodoroStats: w.pomodoroStats || { daily: 0, weekly: 0, total: 0 },
    streak: w.streak || 0,
    lastCompletionDate: w.lastCompletionDate || null,
    theme: w.theme || "light",
    soundOn: w.soundOn !== false,
    volume: w.volume || 70,
    notifPrefs: w.notifPrefs || { taskCompleted: true, dueSoon: true, overdue: true, weeklyReview: true },
  };
}

// Creates a brand-new (empty) workspace document for a username that doesn't exist yet.
async function createWorkspace(username) {
  const key = username.trim().toLowerCase();
  const docData = defaultWorkspaceDoc(username);
  await setDoc(doc(db, "workspaces", key), docData);
  return {
    username: docData.displayName,
    tasks: [],
    history: [],
    notes: [],
    goals: [],
    pomodoroStats: docData.pomodoroStats,
    streak: docData.streak,
    lastCompletionDate: docData.lastCompletionDate,
    theme: docData.theme,
    soundOn: docData.soundOn,
    volume: docData.volume,
    notifPrefs: docData.notifPrefs,
  };
}

// Replaces one field (tasks / notes / goals / history) on the workspace document
// with the current in-memory list. Called on a short debounce after edits.
async function syncCollection(field, items, username) {
  const key = username.trim().toLowerCase();
  if (!key) return;
  await updateDoc(doc(db, "workspaces", key), { [field]: items });
}

// Updates settings + aggregate fields on the workspace document.
async function saveWorkspaceSettings(username, fields) {
  const key = username.trim().toLowerCase();
  if (!key) return;
  await updateDoc(doc(db, "workspaces", key), fields);
}

/* ---------------------------------- 3. Seed data ---------------------------------- */

function seedTasks() {
  const t = todayISO();
  return [
    { id: uid(), title: "Finalize portfolio case study", description: "Polish the TaskSphere write-up with screenshots and metrics.", category: "Work", priority: "High", startDate: t, dueDate: addDays(t, 1), progress: 65, status: "active", notes: "Include before/after UI shots." },
    { id: uid(), title: "Morning run — 5K", description: "Easy pace, focus on breathing.", category: "Health", priority: "Medium", startDate: t, dueDate: t, progress: 0, status: "active", notes: "" },
    { id: uid(), title: "Review monthly budget", description: "Reconcile expenses and update savings target.", category: "Finance", priority: "Low", startDate: addDays(t, -1), dueDate: addDays(t, 2), progress: 20, status: "active", notes: "" },
    { id: uid(), title: "Read 'Atomic Habits' — Ch. 4", description: "Take notes on habit stacking.", category: "Study", priority: "Medium", startDate: t, dueDate: addDays(t, 3), progress: 10, status: "active", notes: "" },
    { id: uid(), title: "Submit tax documents", description: "Upload signed forms to the portal.", category: "Finance", priority: "High", startDate: addDays(t, -3), dueDate: addDays(t, -1), progress: 40, status: "active", notes: "Overdue — needs attention." },
    { id: uid(), title: "Grocery run", description: "Weekly essentials + meal prep items.", category: "Errands", priority: "Low", startDate: t, dueDate: addDays(t, 1), progress: 0, status: "active", notes: "" },
  ];
}

function seedHistory() {
  const t = todayISO();
  const cats = CATEGORY_OPTIONS;
  const prs = ["High", "Medium", "Low"];
  const out = [];
  for (let i = 1; i <= 14; i++) {
    const date = addDays(t, -i);
    const count = i % 3 === 0 ? 2 : 1;
    for (let j = 0; j < count; j++) {
      out.push({
        id: uid(),
        title: ["Plan sprint backlog", "Clean inbox to zero", "Stretch & mobility", "Pay utility bill",
                "Write journal entry", "Call mentor", "Update resume", "Organize desktop files"][(i + j) % 8],
        completionDate: date,
        category: cats[(i + j) % cats.length],
        priority: prs[(i + j) % prs.length],
      });
    }
  }
  return out;
}

function seedNotes() {
  const t = todayISO();
  return [
    { id: uid(), title: "Project ideas", content: "1. Habit tracker widget\n2. Personal CRM\n3. Recipe organizer with grocery list export", updatedAt: t },
    { id: uid(), title: "Meeting notes — Q3 planning", content: "Focus areas: onboarding flow, retention, mobile polish. Revisit pricing in August.", updatedAt: addDays(t, -2) },
    { id: uid(), title: "Book quotes", content: "\"You do not rise to the level of your goals. You fall to the level of your systems.\"", updatedAt: addDays(t, -5) },
  ];
}

function seedGoals() {
  const t = todayISO();
  return [
    { id: uid(), title: "Ship portfolio website", description: "Design, build, and deploy a personal site showcasing 4 projects.", targetDate: addDays(t, 21), progress: 45, taskIds: [] },
    { id: uid(), title: "Read 6 books this quarter", description: "Mix of technical and non-fiction.", targetDate: addDays(t, 60), progress: 30, taskIds: [] },
    { id: uid(), title: "Run a 10K", description: "Build up endurance with a structured running plan.", targetDate: addDays(t, 40), progress: 55, taskIds: [] },
  ];
}

/* ---------------------------------- 4. Primitives ---------------------------------- */

function ProgressRing({ size = 56, stroke = 6, progress = 0, color = "var(--accent)", track = "var(--ring-track)", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, progress)) / 100) * c;
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

function Badge({ children, color, bg }) {
  return <span className="ts-badge" style={{ color, background: bg, borderColor: `${color}30` }}>{children}</span>;
}

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.Low;
  return <Badge color={m.color} bg={m.bg}>{m.label}</Badge>;
}

function IconButton({ icon: Icon, onClick, title, danger, size = 16 }) {
  return (
    <button className={`ts-icon-btn ${danger ? "danger" : ""}`} onClick={onClick} title={title} aria-label={title} type="button">
      <Icon size={size} />
    </button>
  );
}

function Modal({ open, onClose, title, children, width = 520 }) {
  if (!open) return null;
  return (
    <div className="ts-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ts-modal" style={{ maxWidth: width }}>
        <div className="ts-modal-head">
          <h3>{title}</h3>
          <IconButton icon={X} onClick={onClose} title="Close" />
        </div>
        <div className="ts-modal-body">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="ts-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Toast({ toasts }) {
  return (
    <div className="ts-toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`ts-toast ${t.tone || ""}`}>
          {t.icon}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function Confetti({ run }) {
  const pieces = useMemo(() => {
    const colors = ["#6D5DFC", "#EC4899", "#8B5CF6", "#F59E0B", "#10B981"];
    return Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      dur: 2.4 + Math.random() * 1.6,
      color: colors[i % colors.length],
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 200,
      size: 6 + Math.random() * 7,
    }));
  }, [run]);
  if (!run) return null;
  return (
    <div className="ts-confetti-layer">
      {pieces.map((p) => (
        <span key={p.id} className="ts-confetti-piece"
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, width: p.size, height: p.size * 1.4, "--drift": `${p.drift}px`, "--rot": `${p.rotate}deg` }} />
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="ts-empty">
      <div className="ts-empty-icon"><Icon size={24} strokeWidth={1.5} /></div>
      <p className="ts-empty-title">{title}</p>
      {hint && <p className="ts-empty-hint">{hint}</p>}
    </div>
  );
}

/* ---------------------------------- Task Card ---------------------------------- */

function TaskCard({ task, onComplete, onEdit, onDelete }) {
  const meta = PRIORITY_META[task.priority] || PRIORITY_META.Low;
  const overdue = task.status === "active" && dayDiff(todayISO(), task.dueDate) < 0;
  const dueSoon = task.status === "active" && !overdue && dayDiff(todayISO(), task.dueDate) <= 1;

  return (
    <div className="ts-task-card" style={{ "--accent-local": meta.color }}>
      <button className="ts-task-check" onClick={() => onComplete(task)} title="Complete task" type="button">
        <Circle size={20} className="check-idle" />
        <CheckCircle2 size={20} className="check-active" />
      </button>
      <div className="ts-task-main">
        <div className="ts-task-top">
          <h4>{task.title}</h4>
          <div className="ts-task-actions">
            <IconButton icon={Pencil} onClick={() => onEdit(task)} title="Edit task" />
            <IconButton icon={Trash2} onClick={() => onDelete(task)} title="Delete task" danger />
          </div>
        </div>
        {task.description && <p className="ts-task-desc">{task.description}</p>}
        <div className="ts-task-meta">
          <PriorityBadge priority={task.priority} />
          <Badge color="#6B7280" bg="#F1F5F9">{task.category}</Badge>
          {overdue && <Badge color="#EF4444" bg="rgba(239,68,68,0.10)"><AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Overdue</Badge>}
          {dueSoon && <Badge color="#F59E0B" bg="rgba(245,158,11,0.10)"><Clock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Due soon</Badge>}
        </div>
        <div className="ts-task-bottom">
          <span className="ts-task-dates">{fmtDate(task.startDate)} → {fmtDate(task.dueDate)}</span>
          <div className="ts-task-progress">
            <div className="ts-progress-track">
              <div className="ts-progress-fill" style={{ width: `${task.progress}%`, background: `linear-gradient(90deg, #6D5DFC, #EC4899)` }} />
            </div>
            <span>{task.progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Task Form ---------------------------------- */

function TaskForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(
    initial || { title: "", description: "", category: CATEGORY_OPTIONS[0], priority: "Medium", startDate: todayISO(), dueDate: "", progress: 0, notes: "", status: "active" }
  );
  const [showAdvanced, setShowAdvanced] = useState(!!initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="ts-form">
      <Field label="Task name">
        <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs to get done?" autoFocus />
      </Field>
      <Field label="Due date (optional)">
        <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
      </Field>

      {/* Advanced options toggle */}
      <button
        type="button"
        className="ts-advanced-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        Advanced options {showAdvanced ? "▲" : "▼"}
      </button>

      {showAdvanced && (
        <>
          <div className="ts-form-row">
            <Field label="Priority">
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                {Object.keys(PRIORITY_META).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Add detail (optional)" rows={2} />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else worth remembering" rows={2} />
          </Field>
          <Field label={`Progress — ${form.progress}%`}>
            <input type="range" min={0} max={100} value={form.progress} onChange={(e) => set("progress", Number(e.target.value))} />
          </Field>
          <Field label="Start date">
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
        </>
      )}

      <div className="ts-form-actions">
        <button className="ts-btn ghost" onClick={onCancel} type="button">Cancel</button>
        <button className="ts-btn primary" type="button" disabled={!form.title.trim()} onClick={() => {
          const saved = { ...form, title: form.title.trim() };
          if (!saved.dueDate) saved.dueDate = addDays(todayISO(), 7); // default 1 week if not set
          onSave(saved);
        }}>
          {initial ? "Save changes" : "Add task"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- 5a. Dashboard ---------------------------------- */

function Dashboard({ tasks, addTask, updateTask, completeTask, deleteTask, username, streak, productivityScore }) {
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sortBy, setSortBy] = useState("dueDate");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const active = tasks.filter((t) => t.status === "active");
  const overdue = active.filter((t) => dayDiff(todayISO(), t.dueDate) < 0);
  const upcoming = active.filter((t) => dayDiff(todayISO(), t.dueDate) >= 0 && dayDiff(todayISO(), t.dueDate) <= 3);
  const highPriority = active.filter((t) => t.priority === "High");

  const filtered = useMemo(() => {
    let list = active.filter((t) =>
      (priorityFilter === "All" || t.priority === priorityFilter) &&
      (categoryFilter === "All" || t.category === categoryFilter) &&
      (t.title.toLowerCase().includes(query.toLowerCase()) || (t.description || "").toLowerCase().includes(query.toLowerCase()))
    );
    list = [...list].sort((a, b) => {
      if (sortBy === "dueDate") return a.dueDate.localeCompare(b.dueDate);
      if (sortBy === "priority") { const order = { High: 0, Medium: 1, Low: 2 }; return order[a.priority] - order[b.priority]; }
      if (sortBy === "progress") return b.progress - a.progress;
      return 0;
    });
    return list;
  }, [active, query, priorityFilter, categoryFilter, sortBy]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const handleSave = (form) => {
    if (editing) updateTask(editing.id, form); else addTask(form);
    setModalOpen(false);
  };

  return (
    <div className="ts-page">
      {/* Hero */}
      <div className="ts-dash-hero">
        <div className="ts-hero-left">
          <p className="ts-eyebrow">{fmtDateFull(todayISO())}</p>
          <h1 className="ts-hero-title">{greeting}, <span className="ts-gradient-text">{username}</span>.</h1>
          {active.length === 0 && history.length === 0 ? (
            <p className="ts-quote">Welcome to TaskSphere — create your first task to begin your productivity journey.</p>
          ) : (
            <p className="ts-quote">"{quoteOfDay()}"</p>
          )}
        </div>
        <div className="ts-hero-stats">
          <div className="ts-hero-stat-card">
            <ProgressRing size={68} stroke={7} progress={productivityScore} color="#6D5DFC" track="#EDE9FE">
              <span className="ts-ring-num">{productivityScore}%</span>
            </ProgressRing>
            <span className="ts-hero-stat-label">Productivity</span>
          </div>
          <div className="ts-hero-stat-card">
            <div className="ts-streak-pill"><Flame size={18} /> {streak}</div>
            <span className="ts-hero-stat-label">Day streak</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="ts-stat-grid">
        <div className="ts-stat-card"><span className="ts-stat-label">Active tasks</span><span className="ts-stat-value">{active.length}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">Upcoming (3 days)</span><span className="ts-stat-value ts-accent-val">{upcoming.length}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">High priority</span><span className="ts-stat-value" style={{ color: "#EF4444" }}>{highPriority.length}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">Overdue</span><span className="ts-stat-value" style={{ color: overdue.length ? "#EF4444" : "#111827" }}>{overdue.length}</span></div>
      </div>

      {/* Tasks header */}
      <div className="ts-section-head">
        <h2>Your tasks</h2>
        <button className="ts-btn primary" onClick={() => { setEditing(null); setModalOpen(true); }} type="button"><Plus size={16} /> Add task</button>
      </div>

      {/* Toolbar */}
      <div className="ts-toolbar">
        <div className="ts-search">
          <Search size={15} />
          <input placeholder="Search tasks..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="All">All priorities</option>
          {Object.keys(PRIORITY_META).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="All">All categories</option>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="dueDate">Sort by due date</option>
          <option value="priority">Sort by priority</option>
          <option value="progress">Sort by progress</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        active.length === 0 && query === "" && priorityFilter === "All" && categoryFilter === "All"
          ? <EmptyState icon={ListChecks} title="Welcome to TaskSphere" hint="Start by creating your first task. It only takes a few seconds." />
          : <EmptyState icon={ListChecks} title="No tasks match your filters" hint="Try clearing a filter, or add a new task to get started." />
      ) : (
        <div className="ts-task-grid">
          {filtered.map((t) => <TaskCard key={t.id} task={t} onComplete={completeTask} onEdit={(task) => { setEditing(task); setModalOpen(true); }} onDelete={deleteTask} />)}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit task" : "Add task"}>
        <TaskForm initial={editing} onSave={handleSave} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}

/* ---------------------------------- 5b. Calendar ---------------------------------- */

function CalendarTab({ tasks }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [selected, setSelected] = useState(todayISO());

  const grid = useMemo(() => {
    const { year, month } = cursor;
    const first = new Date(year, month, 1);
    const startDow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (t.status !== "active") return;
      let d = t.startDate, guard = 0;
      while (d <= t.dueDate && guard < 60) { (map[d] = map[d] || []).push(t); d = addDays(d, 1); guard++; }
    });
    return map;
  }, [tasks]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedTasks = tasksByDate[selected] || [];
  const upcoming = tasks.filter((t) => t.status === "active" && dayDiff(todayISO(), t.dueDate) >= 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);

  const shiftMonth = (delta) => {
    setCursor((c) => { let m = c.month + delta, y = c.year; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { year: y, month: m }; });
  };

  return (
    <div className="ts-page">
      <div className="ts-section-head"><h1>Calendar</h1></div>
      <div className="ts-calendar-layout">
        <div className="ts-card ts-calendar-card">
          <div className="ts-cal-head">
            <button className="ts-icon-btn" onClick={() => shiftMonth(-1)} type="button"><ChevronLeft size={18} /></button>
            <h3>{monthLabel}</h3>
            <button className="ts-icon-btn" onClick={() => shiftMonth(1)} type="button"><ChevronRight size={18} /></button>
          </div>
          <div className="ts-cal-grid ts-cal-dow">{WEEKDAYS_SHORT.map((d) => <span key={d}>{d}</span>)}</div>
          <div className="ts-cal-grid">
            {grid.map((iso, i) => {
              if (!iso) return <div key={i} className="ts-cal-cell empty" />;
              const dayTasks = tasksByDate[iso] || [];
              return (
                <button key={iso} type="button" className={`ts-cal-cell ${iso === todayISO() ? "today" : ""} ${iso === selected ? "selected" : ""}`} onClick={() => setSelected(iso)}>
                  <span className="ts-cal-daynum">{Number(iso.slice(-2))}</span>
                  <div className="ts-cal-dots">
                    {dayTasks.slice(0, 3).map((t) => <span key={t.id} className="ts-cal-dot" style={{ background: PRIORITY_META[t.priority].color }} />)}
                    {dayTasks.length > 3 && <span className="ts-cal-more">+{dayTasks.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="ts-calendar-side">
          <div className="ts-card">
            <h3>{fmtDateFull(selected)}</h3>
            {selectedTasks.length === 0 ? (
              <EmptyState icon={CalendarIcon} title="Nothing scheduled" hint="A clear day — enjoy it or get ahead." />
            ) : (
              <div className="ts-mini-list">
                {selectedTasks.map((t) => (
                  <div key={t.id} className="ts-mini-item">
                    <span className="ts-mini-dot" style={{ background: PRIORITY_META[t.priority].color }} />
                    <div><p>{t.title}</p><span>{t.category}</span></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ts-card">
            <h3>Upcoming</h3>
            <div className="ts-mini-list">
              {upcoming.map((t) => (
                <div key={t.id} className="ts-mini-item">
                  <span className="ts-mini-dot" style={{ background: PRIORITY_META[t.priority].color }} />
                  <div><p>{t.title}</p><span>{fmtDate(t.dueDate)}</span></div>
                </div>
              ))}
              {upcoming.length === 0 && <p className="ts-empty-hint">Nothing on the horizon.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- 5c. Weekly Planner ---------------------------------- */

function WeeklyPlanner({ tasks }) {
  const [weekStart, setWeekStart] = useState(startOfWeek(todayISO()));
  const days = useMemo(() => WEEKDAYS.map((_, i) => addDays(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = {};
    days.forEach((d) => (map[d] = []));
    tasks.forEach((t) => { if (days.includes(t.dueDate)) map[t.dueDate].push(t); });
    return map;
  }, [tasks, days]);

  const weekTasks = tasks.filter((t) => days.includes(t.dueDate));
  const completed = weekTasks.filter((t) => t.status === "completed").length;
  const pending = weekTasks.filter((t) => t.status === "active" && dayDiff(todayISO(), t.dueDate) >= 0).length;
  const overdueW = weekTasks.filter((t) => t.status === "active" && dayDiff(todayISO(), t.dueDate) < 0).length;
  const successRate = weekTasks.length ? Math.round((completed / weekTasks.length) * 100) : 0;

  return (
    <div className="ts-page">
      <div className="ts-section-head">
        <h1>Weekly planner</h1>
        <div className="ts-week-nav">
          <button className="ts-icon-btn" onClick={() => setWeekStart((w) => addDays(w, -7))} type="button"><ChevronLeft size={18} /></button>
          <span>{fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}</span>
          <button className="ts-icon-btn" onClick={() => setWeekStart((w) => addDays(w, 7))} type="button"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="ts-stat-grid">
        <div className="ts-stat-card"><span className="ts-stat-label">Completed</span><span className="ts-stat-value" style={{ color: "#10B981" }}>{completed}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">Pending</span><span className="ts-stat-value">{pending}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">Overdue</span><span className="ts-stat-value" style={{ color: overdueW ? "#EF4444" : "#111827" }}>{overdueW}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">Success rate</span><span className="ts-stat-value ts-accent-val">{successRate}%</span></div>
      </div>
      <div className="ts-week-grid">
        {days.map((d, i) => {
          const isToday = d === todayISO();
          return (
            <div key={d} className={`ts-week-col ${isToday ? "today" : ""}`}>
              <div className="ts-week-col-head">
                <span>{WEEKDAYS[i]}</span>
                <span className="ts-week-col-date">{fmtDate(d)}</span>
              </div>
              <div className="ts-week-col-body">
                {byDay[d].length === 0 ? <p className="ts-week-empty">No tasks</p> :
                  byDay[d].map((t) => (
                    <div key={t.id} className="ts-week-item" style={{ borderLeftColor: PRIORITY_META[t.priority].color }}>
                      <p>{t.title}</p><span>{t.category}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------- 5d. Notes ---------------------------------- */

function NotesTab({ notes, setNotes }) {
  const [activeId, setActiveId] = useState(notes[0]?.id || null);
  const [query, setQuery] = useState("");
  const filtered = notes.filter((n) => n.title.toLowerCase().includes(query.toLowerCase()) || n.content.toLowerCase().includes(query.toLowerCase()));
  const active = notes.find((n) => n.id === activeId);

  const createNote = () => {
    const n = { id: uid(), title: "Untitled note", content: "", updatedAt: todayISO() };
    setNotes((prev) => [n, ...prev]);
    setActiveId(n.id);
  };

  const updateNote = (id, patch) => setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: todayISO() } : n)));
  const deleteNote = (id) => { setNotes((prev) => prev.filter((n) => n.id !== id)); if (activeId === id) setActiveId(null); };

  return (
    <div className="ts-page ts-notes-page">
      <div className="ts-section-head">
        <h1>Notes</h1>
        <button className="ts-btn primary" onClick={createNote} type="button"><Plus size={16} /> New note</button>
      </div>
      <div className="ts-notes-layout">
        <div className="ts-notes-list-panel">
          <div className="ts-search" style={{ marginBottom: 12 }}>
            <Search size={15} />
            <input placeholder="Search notes..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {filtered.length === 0 ? <EmptyState icon={StickyNote} title="No notes yet" hint="Create your first note." /> : (
            <div className="ts-notes-list">
              {filtered.map((n) => (
                <button key={n.id} type="button" className={`ts-note-row ${n.id === activeId ? "active" : ""}`} onClick={() => setActiveId(n.id)}>
                  <p className="ts-note-row-title">{n.title || "Untitled note"}</p>
                  <p className="ts-note-row-preview">{n.content.slice(0, 60) || "No content"}</p>
                  <span className="ts-note-row-date">{fmtDate(n.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ts-note-editor">
          {active ? (
            <>
              <div className="ts-note-editor-head">
                <input className="ts-note-title-input" value={active.title} onChange={(e) => updateNote(active.id, { title: e.target.value })} placeholder="Note title" />
                <IconButton icon={Trash2} onClick={() => deleteNote(active.id)} title="Delete note" danger />
              </div>
              <textarea className="ts-note-content-input" value={active.content} onChange={(e) => updateNote(active.id, { content: e.target.value })} placeholder="Start writing..." />
              <span className="ts-note-autosave"><Check size={12} /> Saved automatically · {fmtDate(active.updatedAt)}</span>
            </>
          ) : <EmptyState icon={StickyNote} title="Select a note" hint="Choose a note from the list, or create a new one." />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- 5e. Pomodoro ---------------------------------- */

const POMODORO_MODES = {
  "25/5": { focus: 25 * 60, rest: 5 * 60 },
  "50/10": { focus: 50 * 60, rest: 10 * 60 },
};

function PomodoroTab({ stats, recordSession, soundOn, setSoundOn, soundVolume, setSoundVolume, notify }) {
  const [mode, setMode] = useState("25/5");
  const [customFocus, setCustomFocus] = useState(20);
  const [customRest, setCustomRest] = useState(5);
  const [phase, setPhase] = useState("focus");
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_MODES["25/5"].focus);
  const [running, setRunning] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const intervalRef = useRef(null);

  const playChime = useCallback((vol) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime((vol !== undefined ? vol : soundVolume) / 100 * 0.35, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    } catch (e) {}
  }, [soundVolume]);

  const totalForPhase = () => mode === "Custom" ? (phase === "focus" ? customFocus * 60 : customRest * 60) : POMODORO_MODES[mode][phase];

  useEffect(() => {
    setRunning(false); setPhase("focus");
    setSecondsLeft(mode === "Custom" ? customFocus * 60 : POMODORO_MODES[mode].focus);
  }, [mode]);

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(intervalRef.current); handlePhaseComplete(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  function handlePhaseComplete() {
    setRunning(false);
    if (soundOn) playChime();
    if (phase === "focus") {
      recordSession(); setShowComplete(true);
      notify("Focus Session Complete 🎉", "Great work — take a short break.");
      setTimeout(() => setShowComplete(false), 3000);
      setPhase("rest"); setSecondsLeft(mode === "Custom" ? customRest * 60 : POMODORO_MODES[mode].rest);
    } else {
      notify("Break finished ⏰", "Ready for another focus session?");
      setPhase("focus"); setSecondsLeft(mode === "Custom" ? customFocus * 60 : POMODORO_MODES[mode].focus);
    }
  }

  const reset = () => { setRunning(false); setPhase("focus"); setSecondsLeft(mode === "Custom" ? customFocus * 60 : POMODORO_MODES[mode].focus); };
  const total = totalForPhase();
  const pct = total ? ((total - secondsLeft) / total) * 100 : 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="ts-page">
      <div className="ts-section-head"><h1>Pomodoro focus</h1></div>
      <div className="ts-pomodoro-layout">
        <div className="ts-card ts-pomodoro-card">
          <div className="ts-mode-tabs">
            {Object.keys(POMODORO_MODES).map((m) => (
              <button key={m} type="button" className={`ts-mode-tab ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>{m}</button>
            ))}
            <button type="button" className={`ts-mode-tab ${mode === "Custom" ? "active" : ""}`} onClick={() => setMode("Custom")}>Custom</button>
          </div>
          {mode === "Custom" && (
            <div className="ts-custom-row">
              <Field label="Focus (min)"><input type="number" min={1} max={180} value={customFocus} onChange={(e) => setCustomFocus(Number(e.target.value) || 1)} /></Field>
              <Field label="Rest (min)"><input type="number" min={1} max={60} value={customRest} onChange={(e) => setCustomRest(Number(e.target.value) || 1)} /></Field>
            </div>
          )}
          <div className="ts-timer-wrap">
            <ProgressRing size={240} stroke={12} progress={pct} color={phase === "focus" ? "#6D5DFC" : "#10B981"} track="#EDE9FE">
              <div className="ts-timer-center">
                <span className="ts-timer-phase">{phase === "focus" ? "Focus" : "Break"}</span>
                <span className="ts-timer-clock">{mm}:{ss}</span>
              </div>
            </ProgressRing>
          </div>
          <div className="ts-timer-controls">
            {!running ? (
              <button className="ts-btn primary lg" onClick={() => setRunning(true)} type="button"><Play size={18} /> {secondsLeft === total ? "Start" : "Resume"}</button>
            ) : (
              <button className="ts-btn primary lg" onClick={() => setRunning(false)} type="button"><Pause size={18} /> Pause</button>
            )}
            <button className="ts-btn ghost lg" onClick={reset} type="button"><RotateCcw size={18} /> Reset</button>
          </div>
          {showComplete && <div className="ts-complete-banner"><Sparkles size={16} /> Focus Session Complete! 🎉</div>}
        </div>
        <div className="ts-pomodoro-side">
          <div className="ts-card">
            <h3>Session tracker</h3>
            <div className="ts-stat-grid compact">
              <div className="ts-stat-card"><span className="ts-stat-label">Today</span><span className="ts-stat-value">{stats.daily}</span></div>
              <div className="ts-stat-card"><span className="ts-stat-label">This week</span><span className="ts-stat-value">{stats.weekly}</span></div>
              <div className="ts-stat-card"><span className="ts-stat-label">Total</span><span className="ts-stat-value">{stats.total}</span></div>
            </div>
          </div>
          <div className="ts-card">
            <h3>Sound settings</h3>
            <div className="ts-setting-row" style={{ marginBottom: 14 }}>
              <div><p className="ts-setting-title">Sound</p><p className="ts-setting-desc">Play chime when timer ends.</p></div>
              <button className="ts-theme-toggle" onClick={() => setSoundOn((s) => !s)} type="button">
                {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                {soundOn ? "On" : "Off"}
              </button>
            </div>
            {soundOn && (
              <div style={{ marginBottom: 14 }}>
                <p className="ts-setting-title" style={{ fontSize: 12, marginBottom: 6 }}>Volume — {soundVolume}%</p>
                <input type="range" min={0} max={100} value={soundVolume} onChange={(e) => setSoundVolume(Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            )}
            <button className="ts-btn ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => playChime(soundVolume)} type="button">
              <Volume2 size={15} /> Test Sound
            </button>
          </div>
          <div className="ts-card">
            <h3>Tips for deep focus</h3>
            <ul className="ts-tips">
              <li>Silence notifications before a focus block begins.</li>
              <li>Use breaks to stand, stretch, or look away from the screen.</li>
              <li>Stack 2–3 sessions for deep work that needs momentum.</li>
              <li>Keep water at your desk. Hydration sustains attention.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- 5f. History ---------------------------------- */

function HistoryTab({ history }) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("All Time");
  const [sortBy, setSortBy] = useState("date_desc");

  const inRange = (iso) => {
    const diff = dayDiff(iso, todayISO());
    if (range === "Today") return diff === 0;
    if (range === "This Week") return diff >= 0 && diff < 7;
    if (range === "This Month") return diff >= 0 && diff < 31;
    return true;
  };

  const filtered = useMemo(() => {
    let list = history.filter((h) => inRange(h.completionDate) && h.title.toLowerCase().includes(query.toLowerCase()));
    return [...list].sort((a, b) => {
      if (sortBy === "date_desc") return b.completionDate.localeCompare(a.completionDate);
      if (sortBy === "date_asc") return a.completionDate.localeCompare(b.completionDate);
      if (sortBy === "priority") { const order = { High: 0, Medium: 1, Low: 2 }; return order[a.priority] - order[b.priority]; }
      return 0;
    });
  }, [history, query, range, sortBy]);

  return (
    <div className="ts-page">
      <div className="ts-section-head"><h1>History</h1></div>
      <div className="ts-toolbar">
        <div className="ts-search">
          <Search size={15} />
          <input placeholder="Search completed tasks..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          {["Today", "This Week", "This Month", "All Time"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="priority">By priority</option>
        </select>
      </div>
      {filtered.length === 0 ? <EmptyState icon={HistoryIcon} title="No completed tasks in this range" hint="Complete a task and it will show up here." /> : (
        <div className="ts-card">
          <table className="ts-table">
            <thead><tr><th>Task</th><th>Category</th><th>Priority</th><th>Date</th><th>Time</th></tr></thead>
            <tbody>
              {filtered.map((h) => (
                <tr key={h.id}>
                  <td>{h.title}</td>
                  <td><Badge color="#6B7280" bg="#F1F5F9">{h.category || "General"}</Badge></td>
                  <td><PriorityBadge priority={h.priority || "Medium"} /></td>
                  <td>{fmtDate(h.completionDate)}</td>
                  <td style={{ color: "var(--text-soft)", fontSize: 12 }}>{h.completionTime || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- 5g. Analytics ---------------------------------- */

function AnalyticsTab({ tasks, history }) {
  const total = tasks.length + history.length;
  const completed = history.length;
  const pending = tasks.filter((t) => t.status === "active" && dayDiff(todayISO(), t.dueDate) >= 0).length;
  const overdue = tasks.filter((t) => t.status === "active" && dayDiff(todayISO(), t.dueDate) < 0).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  const weekly = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(todayISO(), -i);
      out.push({ day: WEEKDAYS_SHORT[(new Date(d + "T00:00:00").getDay() + 6) % 7], value: history.filter((h) => h.completionDate === d).length });
    }
    return out;
  }, [history]);

  const monthly = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = addDays(todayISO(), -(11 - i) * 7);
      const start = addDays(d, -6);
      return { week: `W${i + 1}`, value: history.filter((h) => h.completionDate >= start && h.completionDate <= d).length };
    });
  }, [history]);

  const priorityDist = useMemo(() => {
    const counts = { High: 0, Medium: 0, Low: 0 };
    [...tasks, ...history].forEach((t) => { if (counts[t.priority] !== undefined) counts[t.priority]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: PRIORITY_META[name].color }));
  }, [tasks, history]);

  const trend = useMemo(() => { let r = 0; return weekly.map((w) => { r += w.value; return { day: w.day, cumulative: r }; }); }, [weekly]);

  return (
    <div className="ts-page">
      <div className="ts-section-head"><h1>Analytics</h1></div>
      <div className="ts-stat-grid" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <div className="ts-stat-card"><span className="ts-stat-label">Total tasks</span><span className="ts-stat-value">{total}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">Completed</span><span className="ts-stat-value" style={{ color: "#10B981" }}>{completed}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">Pending</span><span className="ts-stat-value">{pending}</span></div>
        <div className="ts-stat-card"><span className="ts-stat-label">Overdue</span><span className="ts-stat-value" style={{ color: overdue ? "#EF4444" : "#111827" }}>{overdue}</span></div>
        <div className="ts-stat-card ts-stat-card-accent"><span className="ts-stat-label">Completion rate</span><span className="ts-stat-value ts-accent-val">{completionRate}%</span></div>
      </div>
      <div className="ts-chart-grid">
        <div className="ts-card">
          <h3>Weekly performance</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, color: "#111827" }} />
              <Bar dataKey="value" fill="#6D5DFC" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="ts-card">
          <h3>Monthly performance</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="mFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6D5DFC" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#6D5DFC" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="week" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, color: "#111827" }} />
              <Area type="monotone" dataKey="value" stroke="#6D5DFC" fill="url(#mFill)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="ts-card">
          <h3>Priority distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={priorityDist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {priorityDist.map((p, i) => <Cell key={i} fill={p.color} stroke="none" />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, color: "#111827" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="ts-legend">
            {priorityDist.map((p) => <span key={p.name}><i style={{ background: p.color }} />{p.name} ({p.value})</span>)}
          </div>
        </div>
        <div className="ts-card">
          <h3>Completion trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, color: "#111827" }} />
              <Line type="monotone" dataKey="cumulative" stroke="#EC4899" strokeWidth={2.5} dot={{ r: 3, fill: "#EC4899" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- 5h. Goals ---------------------------------- */

function GoalForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { title: "", description: "", targetDate: addDays(todayISO(), 30), progress: 0 });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="ts-form">
      <Field label="Goal title"><input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What are you working toward?" autoFocus /></Field>
      <Field label="Description"><textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Add detail (optional)" /></Field>
      <Field label="Target completion date"><input type="date" value={form.targetDate} onChange={(e) => set("targetDate", e.target.value)} /></Field>
      <Field label={`Progress — ${form.progress}%`}><input type="range" min={0} max={100} value={form.progress} onChange={(e) => set("progress", Number(e.target.value))} /></Field>
      <div className="ts-form-actions">
        <button className="ts-btn ghost" onClick={onCancel} type="button">Cancel</button>
        <button className="ts-btn primary" disabled={!form.title.trim()} onClick={() => onSave({ ...form, title: form.title.trim() })} type="button">{initial ? "Save changes" : "Add goal"}</button>
      </div>
    </div>
  );
}

function GoalsTab({ goals, setGoals, celebrate }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const handleSave = (form) => {
    if (editing) {
      setGoals((prev) => prev.map((g) => g.id === editing.id ? { ...g, ...form } : g));
      if (form.progress >= 100 && editing.progress < 100) celebrate("Goal Achieved! 🎉");
    } else {
      setGoals((prev) => [{ id: uid(), taskIds: [], ...form }, ...prev]);
    }
    setModalOpen(false);
  };

  const deleteGoal = (id) => setGoals((prev) => prev.filter((g) => g.id !== id));

  return (
    <div className="ts-page">
      <div className="ts-section-head">
        <h1>Goals</h1>
        <button className="ts-btn primary" onClick={() => { setEditing(null); setModalOpen(true); }} type="button"><Plus size={16} /> Add goal</button>
      </div>
      {goals.length === 0 ? <EmptyState icon={Target} title="No goals yet" hint="Set a long-term goal to track meaningful progress." /> : (
        <div className="ts-goal-grid">
          {goals.map((g) => {
            const achieved = g.progress >= 100;
            const daysLeft = dayDiff(todayISO(), g.targetDate);
            return (
              <div key={g.id} className={`ts-card ts-goal-card ${achieved ? "achieved" : ""}`}>
                <div className="ts-goal-top">
                  <ProgressRing size={56} progress={g.progress} color={achieved ? "#10B981" : "#6D5DFC"} track="#EDE9FE">
                    <span className="ts-ring-num sm">{g.progress}%</span>
                  </ProgressRing>
                  <div className="ts-task-actions">
                    <IconButton icon={Pencil} onClick={() => { setEditing(g); setModalOpen(true); }} title="Edit goal" />
                    <IconButton icon={Trash2} onClick={() => deleteGoal(g.id)} title="Delete goal" danger />
                  </div>
                </div>
                <h4>{g.title}</h4>
                {g.description && <p className="ts-task-desc">{g.description}</p>}
                <div className="ts-task-bottom">
                  <span className="ts-task-dates">
                    {achieved ? <><Award size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Goal Achieved</> : daysLeft >= 0 ? `${daysLeft} days left` : "Past target date"}
                  </span>
                  <span style={{ fontSize: 11.5, color: "#6B7280" }}>{fmtDate(g.targetDate)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit goal" : "Add goal"}>
        <GoalForm initial={editing} onSave={handleSave} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}

/* ---------------------------------- 5i. Settings ---------------------------------- */

function SettingsTab({ theme, setTheme, soundOn, setSoundOn, notifPrefs, setNotifPrefs, username, setUsername, onLogout }) {
  const [nameInput, setNameInput] = useState(username);
  const toggleNotif = (key) => setNotifPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="ts-page">
      <div className="ts-section-head"><h1>Settings</h1></div>
      <div className="ts-settings-grid">
        <div className="ts-card">
          <h3>Appearance</h3>
          <div className="ts-setting-row">
            <div><p className="ts-setting-title">Theme</p><p className="ts-setting-desc">Switch between light and dark mode.</p></div>
            <button className="ts-theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">
              {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
              {theme === "dark" ? "Dark" : "Light"}
            </button>
          </div>
        </div>
        <div className="ts-card">
          <h3>Notifications</h3>
          {[["taskCompleted", "Task completed", "Confirm when you mark a task done."], ["dueSoon", "Due soon", "Heads-up before a deadline."], ["overdue", "Overdue", "Alert when a task passes its due date."], ["weeklyReview", "Weekly review", "A Sunday evening productivity summary."]].map(([key, title, desc]) => (
            <div className="ts-setting-row" key={key}>
              <div><p className="ts-setting-title">{title}</p><p className="ts-setting-desc">{desc}</p></div>
              <label className="ts-switch"><input type="checkbox" checked={notifPrefs[key]} onChange={() => toggleNotif(key)} /><span /></label>
            </div>
          ))}
        </div>
        <div className="ts-card">
          <h3>Sound</h3>
          <div className="ts-setting-row">
            <div><p className="ts-setting-title">Notification sound</p><p className="ts-setting-desc">Play a gentle chime for completions and timers.</p></div>
            <button className="ts-theme-toggle" onClick={() => setSoundOn((s) => !s)} type="button">
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {soundOn ? "On" : "Off"}
            </button>
          </div>
        </div>
        <div className="ts-card">
          <h3>Account</h3>
          <Field label="Display name"><input value={nameInput} onChange={(e) => setNameInput(e.target.value)} /></Field>
          <div className="ts-form-actions" style={{ justifyContent: "flex-start", marginTop: 8 }}>
            <button className="ts-btn primary" onClick={() => setUsername(nameInput.trim() || username)} type="button">Save name</button>
          </div>
          <hr className="ts-divider" />
          <button className="ts-btn ghost" onClick={onLogout} type="button"><LogOut size={15} /> Log out</button>
        </div>
        <div className="ts-card">
          <h3>About data</h3>
          <p className="ts-setting-desc">TaskSphere keeps all your tasks, notes, goals, and history in memory for this session. Data stays private — nothing is sent anywhere.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Login Gate — Create / Enter Workspace ---------------------------------- */

function LoginGate({ onSuccess }) {
  const [screen, setScreen] = useState("enter"); // "enter" | "create"
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(null); // null | "not_found" | "shake" | "created" | "exists" | "error"
  const [busy, setBusy] = useState(false);

  const handleEnter = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ws = await getWorkspace(value.trim());
      if (ws) {
        onSuccess(ws.username, ws);
      } else {
        setStatus("not_found");
        setTimeout(() => setStatus(null), 3000);
      }
    } catch (e) {
      setStatus("error");
      setTimeout(() => setStatus(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (busy) return;
    const name = value.trim();
    if (!name) return;
    setBusy(true);
    try {
      const existing = await getWorkspace(name);
      if (existing) {
        setStatus("exists");
        setTimeout(() => setStatus(null), 3000);
        return;
      }
      const ws = await createWorkspace(name);
      setStatus("created");
      setTimeout(() => onSuccess(ws.username, ws), 1200);
    } catch (e) {
      setStatus("error");
      setTimeout(() => setStatus(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const isEnter = screen === "enter";

  return (
    <div className="ts-login-screen">
      {/* Decorative blobs */}
      <div className="ts-login-blob ts-blob-1" />
      <div className="ts-login-blob ts-blob-2" />

      <div className="ts-login-card">
        {/* Brand */}
        <div className="ts-login-mark">
          <div className="ts-login-mark-inner">
            <Target size={22} color="white" />
          </div>
        </div>
        <h1 className="ts-login-title">TaskSphere</h1>
        <p className="ts-login-tagline">Plan. Focus. Achieve.</p>

        {/* Tab switcher */}
        <div className="ts-login-tabs">
          <button type="button" className={`ts-login-tab ${isEnter ? "active" : ""}`} onClick={() => { setScreen("enter"); setValue(""); setStatus(null); }}>Enter Workspace</button>
          <button type="button" className={`ts-login-tab ${!isEnter ? "active" : ""}`} onClick={() => { setScreen("create"); setValue(""); setStatus(null); }}>Create Workspace</button>
        </div>

        <div className={`ts-login-form-area ${status === "not_found" || status === "exists" ? "shake" : ""}`}>
          <Field label="Username">
            <input
              value={value}
              onChange={(e) => { setValue(e.target.value); setStatus(null); }}
              onKeyDown={(e) => e.key === "Enter" && (isEnter ? handleEnter() : handleCreate())}
              placeholder={isEnter ? "Enter your username" : "Choose a username"}
              autoFocus
            />
          </Field>

          {status === "created" ? (
            <div className="ts-login-success"><CheckCircle2 size={16} /> Workspace created! Redirecting…</div>
          ) : (
            <button className="ts-btn primary lg ts-login-cta" onClick={isEnter ? handleEnter : handleCreate} type="button" disabled={!value.trim() || busy}>
              {busy ? "Please wait…" : (isEnter ? "Enter Workspace" : "Create Workspace")} <ArrowRight size={16} />
            </button>
          )}

          {status === "not_found" && (
            <div className="ts-login-error">
              <X size={14} /> Workspace not found.
              <button type="button" className="ts-login-link" onClick={() => { setScreen("create"); setStatus(null); }}>Create one?</button>
            </div>
          )}
          {status === "exists" && (
            <div className="ts-login-error">
              <X size={14} /> Username taken.
              <button type="button" className="ts-login-link" onClick={() => { setScreen("enter"); setStatus(null); }}>Log in instead?</button>
            </div>
          )}
          {status === "error" && (
            <div className="ts-login-error">
              <X size={14} /> Couldn't reach the server. Check your connection and try again.
            </div>
          )}
        </div>

        <p className="ts-login-hint">No email. No password. Just your username.</p>
      </div>
    </div>
  );
}

/* ---------------------------------- 6. App Shell ---------------------------------- */

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "planner", label: "Weekly Planner", icon: CalendarDays },
  { id: "notes", label: "Notes", icon: StickyNote },
  { id: "pomodoro", label: "Pomodoro", icon: Timer },
  { id: "history", label: "History", icon: HistoryIcon },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "goals", label: "Goals", icon: Target },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export default function TaskSphereApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [theme, setTheme] = useState("light");
  const [tab, setTab] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState([]);
  const [notes, setNotes] = useState([]);
  const [goals, setGoals] = useState([]);
  const [soundOn, setSoundOn] = useState(true);
  const [notifPrefs, setNotifPrefs] = useState({ taskCompleted: true, dueSoon: true, overdue: true, weeklyReview: true });
  const [toasts, setToasts] = useState([]);
  const [confettiRun, setConfettiRun] = useState(0);
  const [pomodoroStats, setPomodoroStats] = useState({ daily: 0, weekly: 0, total: 0 });
  const [streak, setStreak] = useState(0);
  const [lastCompletionDate, setLastCompletionDate] = useState(null);
  const [soundVolume, setSoundVolume] = useState(70);

  // True only after a successful login has populated state from Firestore.
  // Prevents the save-effects below from firing (and overwriting saved data
  // with empty defaults) during the brief window before login completes.
  const hydratedRef = useRef(false);

  const pushToast = useCallback((message, tone = "default", icon = <CheckCircle2 size={16} />) => {
    const id = uid();
    setToasts((prev) => [...prev, { id, message, tone, icon }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  const notify = useCallback((title, body) => {
    pushToast(title, "default", <Bell size={16} />);
    try {
      if (typeof Notification !== "undefined") {
        if (Notification.permission === "granted") new Notification(title, { body });
        else if (Notification.permission !== "denied") Notification.requestPermission().then((p) => { if (p === "granted") new Notification(title, { body }); });
      }
    } catch (e) {}
  }, [pushToast]);

  const celebrate = useCallback((label) => {
    setConfettiRun((n) => n + 1);
    pushToast(label, "success", <Sparkles size={16} />);
  }, [pushToast]);

  const addTask = (form) => { setTasks((prev) => [{ id: uid(), status: "active", ...form }, ...prev]); pushToast("Task added", "default", <Plus size={16} />); };
  const updateTask = (id, form) => { setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...form } : t)); pushToast("Task updated", "default", <Pencil size={16} />); };
  const deleteTask = (task) => { setTasks((prev) => prev.filter((t) => t.id !== task.id)); pushToast("Task deleted"); };
  const playSound = useCallback((vol) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime((vol !== undefined ? vol : soundVolume) / 100 * 0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.7);
    } catch (e) {}
  }, [soundVolume]);

  const completeTask = (task) => {
    const today = todayISO();
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const completionTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    setHistory((prev) => [{ id: uid(), title: task.title, completionDate: today, completionTime, category: task.category || "General", priority: task.priority || "Medium" }, ...prev]);

    // Streak logic: consecutive calendar days
    setStreak((s) => {
      if (!lastCompletionDate) return 1;
      const diff = dayDiff(lastCompletionDate, today);
      if (diff === 0) return s; // same day, no change
      if (diff === 1) return s + 1; // consecutive day
      return 1; // streak broken
    });
    setLastCompletionDate(today);

    if (soundOn) playSound();
    celebrate("🎉 Task Completed Successfully!");
    if (notifPrefs.taskCompleted) notify("Task Completed ✓", task.title);
    setGoals((prev) => prev.map((g) => {
      if (!g.taskIds.includes(task.id)) return g;
      const np = Math.min(100, g.progress + 8);
      if (np >= 100 && g.progress < 100) celebrate("Goal Achieved! 🎉");
      return { ...g, progress: np };
    }));
  };

  const recordSession = () => setPomodoroStats((s) => ({ daily: s.daily + 1, weekly: s.weekly + 1, total: s.total + 1 }));

  const productivityScore = useMemo(() => {
    const total = tasks.length + history.length;
    if (total === 0) return 0;
    return Math.round((history.length / total) * 100);
  }, [tasks, history]);

  useEffect(() => { document.documentElement.setAttribute("data-ts-theme", theme); }, [theme]);

  const handleLogin = (name, ws) => {
    hydratedRef.current = false; // pause saves while we populate state from the loaded workspace
    setUsername(ws.username);
    setTasks(ws.tasks);
    setHistory(ws.history);
    setNotes(ws.notes);
    setGoals(ws.goals);
    setPomodoroStats(ws.pomodoroStats);
    setStreak(ws.streak || 0);
    setLastCompletionDate(ws.lastCompletionDate || null);
    setSoundOn(ws.soundOn !== false);
    setSoundVolume(ws.volume || 70);
    setNotifPrefs(ws.notifPrefs);
    setTheme(ws.theme || "light");
    setTab("dashboard");
    setLoggedIn(true);
    // Allow the save-effects to resume on the next tick, after this state has committed.
    setTimeout(() => { hydratedRef.current = true; }, 0);
  };

  const handleLogout = () => { hydratedRef.current = false; setLoggedIn(false); setTab("dashboard"); };

  /* ---- Persist to Firestore whenever data changes (debounced) ---- */
  useEffect(() => {
    if (!loggedIn || !hydratedRef.current || !username) return;
    const t = setTimeout(() => {
      syncCollection("tasks", tasks, username).catch((e) => {
        console.error("Failed to save tasks:", e);
        pushToast("Couldn't save tasks — check your connection", "default", <AlertTriangle size={16} />);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [tasks, loggedIn, username, pushToast]);

  useEffect(() => {
    if (!loggedIn || !hydratedRef.current || !username) return;
    const t = setTimeout(() => {
      syncCollection("notes", notes, username).catch((e) => {
        console.error("Failed to save notes:", e);
        pushToast("Couldn't save notes — check your connection", "default", <AlertTriangle size={16} />);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [notes, loggedIn, username, pushToast]);

  useEffect(() => {
    if (!loggedIn || !hydratedRef.current || !username) return;
    const t = setTimeout(() => {
      syncCollection("goals", goals, username).catch((e) => {
        console.error("Failed to save goals:", e);
        pushToast("Couldn't save goals — check your connection", "default", <AlertTriangle size={16} />);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [goals, loggedIn, username, pushToast]);

  useEffect(() => {
    if (!loggedIn || !hydratedRef.current || !username) return;
    const t = setTimeout(() => {
      syncCollection("history", history, username).catch((e) => {
        console.error("Failed to save history:", e);
        pushToast("Couldn't save history — check your connection", "default", <AlertTriangle size={16} />);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [history, loggedIn, username, pushToast]);

  // Settings + aggregate fields (theme, sound, volume, notif prefs, streak, pomodoro stats)
  // live on the workspace document, so they're batched into one update.
  useEffect(() => {
    if (!loggedIn || !hydratedRef.current || !username) return;
    const t = setTimeout(() => {
      saveWorkspaceSettings(username, {
        theme,
        soundOn,
        volume: soundVolume,
        notifPrefs,
        streak,
        lastCompletionDate: lastCompletionDate ?? null,
        pomodoroStats,
      }).catch((e) => {
        console.error("Failed to save settings:", e);
        pushToast("Couldn't save settings — check your connection", "default", <AlertTriangle size={16} />);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [theme, soundOn, soundVolume, notifPrefs, streak, lastCompletionDate, pomodoroStats, loggedIn, username, pushToast]);

  // Username can be changed in Settings; update the display name to match.
  useEffect(() => {
    if (!loggedIn || !hydratedRef.current || !username) return;
    const t = setTimeout(() => {
      saveWorkspaceSettings(username, { displayName: username }).catch((e) => {
        console.error("Failed to save display name:", e);
      });
    }, 500);
    return () => clearTimeout(t);
  }, [username, loggedIn, pushToast]);

  if (!loggedIn) return (
    <>
      <StyleSheet />
      <LoginGate onSuccess={handleLogin} />
    </>
  );

  return (
    <div className="ts-app" data-ts-theme={theme}>
      <StyleSheet />
      <Confetti run={confettiRun} />
      <Toast toasts={toasts} />

      {/* Sidebar (desktop) */}
      <aside className="ts-sidebar">
        <div className="ts-brand">
          <div className="ts-brand-mark"><Target size={18} /></div>
          <div>
            <p className="ts-brand-name">TaskSphere</p>
            <p className="ts-brand-tag">Plan. Focus. Achieve.</p>
          </div>
        </div>
        <nav className="ts-nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" className={`ts-nav-item ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
              <item.icon size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="ts-sidebar-footer">
          <button className="ts-theme-toggle full" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">
            {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
            {theme === "dark" ? "Dark mode" : "Light mode"}
          </button>
          <div className="ts-user-chip"><User size={14} /><span>{username}</span></div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="ts-mobile-bar">
        <div className="ts-brand">
          <div className="ts-brand-mark sm"><Target size={15} /></div>
          <p className="ts-brand-name">TaskSphere</p>
        </div>
        <button className="ts-icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">
          {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </header>

      <main className="ts-main">
        {tab === "dashboard" && <Dashboard tasks={tasks} addTask={addTask} updateTask={updateTask} completeTask={completeTask} deleteTask={deleteTask} username={username} streak={streak} productivityScore={productivityScore} />}
        {tab === "calendar" && <CalendarTab tasks={tasks} />}
        {tab === "planner" && <WeeklyPlanner tasks={[...tasks, ...history.map(h => ({ ...h, dueDate: h.completionDate, status: "completed" }))]} />}
        {tab === "notes" && <NotesTab notes={notes} setNotes={setNotes} />}
        {tab === "pomodoro" && <PomodoroTab stats={pomodoroStats} recordSession={recordSession} soundOn={soundOn} setSoundOn={setSoundOn} soundVolume={soundVolume} setSoundVolume={setSoundVolume} notify={notify} />}
        {tab === "history" && <HistoryTab history={history} />}
        {tab === "analytics" && <AnalyticsTab tasks={tasks} history={history} />}
        {tab === "goals" && <GoalsTab goals={goals} setGoals={setGoals} celebrate={celebrate} />}
        {tab === "settings" && <SettingsTab theme={theme} setTheme={setTheme} soundOn={soundOn} setSoundOn={setSoundOn} notifPrefs={notifPrefs} setNotifPrefs={setNotifPrefs} username={username} setUsername={setUsername} onLogout={handleLogout} />}
        <div style={{ height: 84 }} className="ts-mobile-spacer" />
      </main>

      {/* Mobile bottom nav */}
      <nav className="ts-mobile-nav">
        {NAV_ITEMS.slice(0, 4).map((item) => (
          <button key={item.id} type="button" className={`ts-mobile-nav-item ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
            <item.icon size={19} /><span>{item.label.split(" ")[0]}</span>
          </button>
        ))}
        <button type="button" className="ts-mobile-nav-item" onClick={() => setMobileNavOpen(true)}>
          <Menu size={19} /><span>More</span>
        </button>
      </nav>

      {mobileNavOpen && (
        <div className="ts-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setMobileNavOpen(false); }}>
          <div className="ts-modal" style={{ maxWidth: 360 }}>
            <div className="ts-modal-head"><h3>Menu</h3><IconButton icon={X} onClick={() => setMobileNavOpen(false)} title="Close" /></div>
            <div className="ts-modal-body">
              <div className="ts-more-grid">
                {NAV_ITEMS.map((item) => (
                  <button key={item.id} type="button" className={`ts-more-item ${tab === item.id ? "active" : ""}`} onClick={() => { setTab(item.id); setMobileNavOpen(false); }}>
                    <item.icon size={20} /><span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Styles ---------------------------------- */

function StyleSheet() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

      /* ---- Design tokens ---- */
      :root, :root[data-ts-theme="light"]{
        --bg: #F8FAFC;
        --surface: #FFFFFF;
        --surface-2: #F1F5F9;
        --border: #E5E7EB;
        --border-light: #F1F5F9;
        --text: #111827;
        --text-soft: #6B7280;
        --text-muted: #94A3B8;
        --chip-bg: #F1F5F9;
        --ring-track: #EDE9FE;
        --accent: #6D5DFC;
        --accent-2: #8B5CF6;
        --accent-pink: #EC4899;
        --accent-soft: rgba(109,93,252,0.08);
        --accent-hover: #5B4DF5;
        --gradient: linear-gradient(135deg, #6D5DFC 0%, #8B5CF6 50%, #EC4899 100%);
        --grid-line: #F1F5F9;
        --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
        --shadow: 0 4px 16px rgba(109,93,252,0.10), 0 1px 4px rgba(0,0,0,0.06);
        --shadow-lg: 0 16px 48px rgba(109,93,252,0.14), 0 4px 16px rgba(0,0,0,0.08);
        --success: #10B981;
        --warning: #F59E0B;
        --danger: #EF4444;
        --info: #3B82F6;
      }
      :root[data-ts-theme="dark"]{
        --bg: #0B0E14;
        --surface: #11151F;
        --surface-2: #161B27;
        --border: #222838;
        --border-light: #1C2230;
        --text: #EAEDF4;
        --text-soft: #8A92A6;
        --text-muted: #555E72;
        --chip-bg: #1B2130;
        --ring-track: #1E2433;
        --accent: #6D5DFC;
        --accent-2: #8B5CF6;
        --accent-pink: #EC4899;
        --accent-soft: rgba(109,93,252,0.16);
        --accent-hover: #7B6DFD;
        --gradient: linear-gradient(135deg, #6D5DFC 0%, #8B5CF6 50%, #EC4899 100%);
        --grid-line: #1C2230;
        --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
        --shadow: 0 4px 16px rgba(0,0,0,0.35);
        --shadow-lg: 0 16px 48px rgba(0,0,0,0.45);
        --success: #10B981;
        --warning: #F59E0B;
        --danger: #EF4444;
        --info: #3B82F6;
      }

      /* ---- Base ---- */
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; }
      h1,h2,h3,h4 { font-family: 'Space Grotesk', 'Inter', sans-serif; margin: 0; letter-spacing: -0.015em; }
      button { font-family: inherit; cursor: pointer; }
      input, select, textarea { font-family: inherit; }

      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow-x: hidden; }
      #root { width: 100%; min-height: 100vh; }
      .ts-app {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        background: var(--bg);
        color: var(--text);
        min-height: 100vh;
        width: 100vw;
        display: grid;
        grid-template-columns: 240px 1fr;
      }
      .ts-app * { box-sizing: border-box; }

      /* ---- Gradient text ---- */
      .ts-gradient-text {
        background: var(--gradient);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      /* ---- Sidebar ---- */
      .ts-sidebar {
        background: var(--surface);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        padding: 20px 14px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
      }
      .ts-brand { display:flex; align-items:center; gap:10px; padding: 6px 8px 22px; }
      .ts-brand-mark {
        width: 36px; height: 36px; border-radius: 10px;
        background: var(--gradient);
        color: white; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(109,93,252,0.35);
      }
      .ts-brand-mark.sm { width:28px; height:28px; border-radius:8px; }
      .ts-brand-name { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15px; margin:0; }
      .ts-brand-tag { font-size:11px; color: var(--text-soft); margin:0; letter-spacing: 0.02em; }

      .ts-nav { display:flex; flex-direction:column; gap:2px; flex:1; }
      .ts-nav-item {
        display: flex; align-items: center; gap: 11px;
        padding: 10px 12px; border-radius: 10px; border: none;
        background: transparent; color: var(--text-soft);
        font-size: 13.5px; font-weight: 500; text-align: left;
        transition: all .15s ease;
        position: relative;
      }
      .ts-nav-item:hover { background: var(--surface-2); color: var(--text); }
      .ts-nav-item.active {
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 600;
      }
      .ts-nav-item.active::before {
        content: '';
        position: absolute; left: 0; top: 6px; bottom: 6px;
        width: 3px; border-radius: 0 3px 3px 0;
        background: var(--gradient);
      }

      .ts-sidebar-footer { display:flex; flex-direction:column; gap:10px; padding-top:12px; border-top:1px solid var(--border); }
      .ts-user-chip { display:flex; align-items:center; gap:8px; font-size:13px; color: var(--text-soft); padding: 6px 8px; }

      .ts-theme-toggle {
        display: flex; align-items: center; gap: 8px; justify-content: center;
        padding: 9px 12px; border-radius: 9px;
        border: 1px solid var(--border);
        background: var(--surface-2); color: var(--text);
        font-size: 13px; font-weight: 500; transition: all .15s;
      }
      .ts-theme-toggle:hover { background: var(--chip-bg); }
      .ts-theme-toggle.full { width: 100%; }

      /* ---- Mobile ---- */
      .ts-mobile-bar { display: none; }
      .ts-mobile-nav { display: none; }

      /* ---- Main content ---- */
      .ts-main { padding: 28px 32px 0; min-height: 100vh; overflow-x: hidden; flex: 1; width: 100%; }
      .ts-page { width: 100%; max-width: 100%; padding-bottom: 48px; }

      /* ---- Dashboard hero ---- */
      .ts-dash-hero {
        display: flex; justify-content: space-between; align-items: center;
        gap: 24px; margin-bottom: 24px; flex-wrap: wrap;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 20px; padding: 32px 40px;
        box-shadow: var(--shadow-sm);
        position: relative; overflow: hidden; width: 100%;
      }
      .ts-dash-hero::before {
        content: '';
        position: absolute; top: 0; right: 0;
        width: 300px; height: 100%;
        background: radial-gradient(ellipse at right top, rgba(109,93,252,0.06) 0%, transparent 70%);
        pointer-events: none;
      }
      .ts-hero-left { flex: 1; min-width: 0; }
      .ts-eyebrow { color: var(--text-muted); font-size:12px; margin:0 0 4px; text-transform:uppercase; letter-spacing:.08em; font-weight: 600; }
      .ts-hero-title { font-size: 28px; margin-bottom: 8px; color: var(--text); }
      .ts-quote { color: var(--text-soft); font-size:13.5px; font-style:italic; margin:0; max-width:460px; line-height: 1.6; }
      .ts-hero-stats { display: flex; gap: 20px; align-items: center; }
      .ts-hero-stat-card { display:flex; flex-direction:column; align-items:center; gap:8px; }
      .ts-hero-stat-label { font-size:11.5px; color: var(--text-soft); font-weight: 500; }
      .ts-ring-num { font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:16px; color: var(--text); }
      .ts-ring-num.sm { font-size:13px; }
      .ts-streak-pill {
        display: flex; align-items: center; gap: 6px;
        background: linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06));
        color: #F59E0B; padding: 10px 18px; border-radius: 999px;
        font-weight: 700; font-size: 16px;
        border: 1px solid rgba(245,158,11,0.2);
      }

      /* ---- Stats grid ---- */
      .ts-stat-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 26px; }
      .ts-stat-grid.compact { grid-template-columns: repeat(3,1fr); gap:10px; margin-bottom:0; }
      .ts-stat-card {
        background: var(--surface); border:1px solid var(--border); border-radius: 16px;
        padding: 18px 20px; display:flex; flex-direction:column; gap:6px;
        transition: box-shadow .15s, transform .15s;
      }
      .ts-stat-card:hover { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
      .ts-stat-card-accent { border-color: rgba(109,93,252,0.2); background: rgba(109,93,252,0.03); }
      .ts-stat-label { font-size:12px; color: var(--text-soft); font-weight: 500; }
      .ts-stat-value { font-family:'Space Grotesk',sans-serif; font-size:26px; font-weight:700; }
      .ts-accent-val { background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }

      /* ---- Section head ---- */
      .ts-section-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; gap:12px; flex-wrap:wrap; }
      .ts-section-head h1 { font-size:22px; }
      .ts-section-head h2 { font-size:17px; }

      /* ---- Buttons ---- */
      .ts-btn {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 9px 17px; border-radius: 10px; border: 1px solid transparent;
        font-size: 13.5px; font-weight: 600; transition: all .15s ease;
        white-space: nowrap;
      }
      .ts-btn.primary {
        background: var(--gradient);
        color: white;
        box-shadow: 0 4px 14px rgba(109,93,252,0.35);
      }
      .ts-btn.primary:hover { filter: brightness(1.07); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(109,93,252,0.4); }
      .ts-btn.primary:disabled { opacity:.5; cursor:not-allowed; box-shadow:none; transform:none; }
      .ts-btn.ghost { background: var(--surface-2); color: var(--text); border-color: var(--border); }
      .ts-btn.ghost:hover { background: var(--chip-bg); }
      .ts-btn.lg { padding: 12px 22px; font-size:14.5px; border-radius: 12px; }

      /* ---- Toolbar ---- */
      .ts-toolbar { display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap; }
      .ts-search {
        display: flex; align-items: center; gap: 8px;
        background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
        padding: 9px 13px; flex: 1; min-width: 200px; color: var(--text-soft);
        transition: border-color .15s;
      }
      .ts-search:focus-within { border-color: var(--accent); }
      .ts-search input { border:none; background:transparent; outline:none; color: var(--text); width:100%; font-size:13.5px; }
      .ts-toolbar select {
        background: var(--surface); border: 1px solid var(--border);
        color: var(--text); border-radius: 10px; padding: 9px 12px; font-size: 13px;
        transition: border-color .15s;
      }
      .ts-toolbar select:focus { outline: none; border-color: var(--accent); }

      /* ---- Task cards ---- */
      .ts-task-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:16px; }
      .ts-task-card {
        background: var(--surface); border: 1px solid var(--border);
        border-left: 3px solid var(--accent-local);
        border-radius: 14px; padding: 16px; display: flex; gap: 12px;
        transition: transform .15s, box-shadow .15s;
      }
      .ts-task-card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
      .ts-task-check { background:none; border:none; color: var(--text-muted); flex-shrink:0; padding-top:2px; }
      .ts-task-check .check-active { display:none; }
      .ts-task-check:hover .check-idle { display:none; }
      .ts-task-check:hover .check-active { display:block; color: var(--success); }
      .ts-task-main { flex:1; min-width:0; }
      .ts-task-top { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
      .ts-task-top h4 { font-size:14.5px; font-weight:600; line-height: 1.4; }
      .ts-task-actions { display:flex; gap:2px; flex-shrink:0; }
      .ts-task-desc { font-size:12.5px; color: var(--text-soft); margin: 4px 0 10px; line-height:1.5; }
      .ts-task-meta { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
      .ts-task-bottom { display:flex; justify-content:space-between; align-items:center; gap:10px; }
      .ts-task-dates { font-size:11.5px; color: var(--text-muted); white-space:nowrap; }
      .ts-task-progress { display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-end; }
      .ts-progress-track { flex:1; max-width:90px; height:5px; background: var(--ring-track); border-radius:99px; overflow:hidden; }
      .ts-progress-fill { height:100%; border-radius:99px; transition: width .4s ease; }
      .ts-task-progress span { font-size:11.5px; color: var(--text-muted); width:32px; text-align:right; }

      /* ---- Badges ---- */
      .ts-badge {
        font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 99px;
        border: 1px solid; display: inline-flex; align-items: center; white-space: nowrap;
      }

      /* ---- Icon button ---- */
      .ts-icon-btn {
        background: transparent; border: none; color: var(--text-soft);
        padding: 6px; border-radius: 8px; display: flex; align-items: center;
        justify-content: center; transition: all .15s;
      }
      .ts-icon-btn:hover { background: var(--chip-bg); color: var(--text); }
      .ts-icon-btn.danger:hover { background: rgba(239,68,68,0.10); color: var(--danger); }

      /* ---- Card ---- */
      .ts-card {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 16px; padding: 20px;
        box-shadow: var(--shadow-sm);
      }
      .ts-card h3 { font-size:14.5px; margin-bottom:14px; }

      /* ---- Modal ---- */
      .ts-modal-overlay {
        position: fixed; inset: 0;
        background: rgba(17,24,39,0.4);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        z-index: 100; padding: 16px;
      }
      .ts-modal {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 20px; width: 100%; max-height: 88vh;
        overflow-y: auto; box-shadow: var(--shadow-lg);
      }
      .ts-modal-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 18px 20px; border-bottom: 1px solid var(--border);
        position: sticky; top: 0; background: var(--surface); z-index:1;
      }
      .ts-modal-head h3 { font-size: 16px; }
      .ts-modal-body { padding: 20px; }

      /* ---- Form ---- */
      .ts-form { display:flex; flex-direction:column; gap:14px; }
      .ts-form-row { display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
      .ts-field { display:flex; flex-direction:column; gap:6px; font-size:12px; color: var(--text-soft); font-weight:600; letter-spacing: 0.02em; text-transform: uppercase; }
      .ts-field input, .ts-field select, .ts-field textarea {
        background: var(--surface-2); border: 1px solid var(--border);
        border-radius: 10px; padding: 10px 12px; color: var(--text);
        font-size: 13.5px; outline: none; resize: vertical;
        transition: border-color .15s, box-shadow .15s;
        text-transform: none;
      }
      .ts-field input:focus, .ts-field select:focus, .ts-field textarea:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(109,93,252,0.12);
      }
      .ts-field input[type="range"] { padding: 0; accent-color: var(--accent); }
      .ts-form-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:6px; }
      .ts-advanced-toggle {
        background: none; border: 1px dashed var(--border); border-radius: 9px;
        color: var(--accent); font-size: 12.5px; font-weight: 600;
        padding: 8px 14px; text-align: left; transition: all .15s;
        cursor: pointer; letter-spacing: 0.01em;
      }
      .ts-advanced-toggle:hover { background: var(--accent-soft); border-color: rgba(109,93,252,0.3); }

      /* ---- Calendar ---- */
      .ts-calendar-layout { display:grid; grid-template-columns: 1.7fr 1fr; gap:18px; }
      .ts-calendar-card { padding: 18px 20px; }
      .ts-cal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
      .ts-cal-head h3 { font-size:16px; }
      .ts-cal-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap:5px; }
      .ts-cal-dow { margin-bottom:8px; }
      .ts-cal-dow span { font-size:11px; color: var(--text-muted); text-align:center; font-weight:600; display:block; }
      .ts-cal-cell {
        aspect-ratio: 1; border-radius: 10px; border: 1px solid transparent;
        background: var(--surface-2); display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:4px; padding:4px;
        transition: all .12s;
      }
      .ts-cal-cell.empty { background:transparent; border-color:transparent; }
      .ts-cal-cell:not(.empty):hover { border-color: var(--accent); background: var(--accent-soft); }
      .ts-cal-cell.today { background: var(--accent-soft); border-color: rgba(109,93,252,0.2); }
      .ts-cal-cell.selected { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(109,93,252,0.2); }
      .ts-cal-daynum { font-size:12px; font-weight:600; }
      .ts-cal-cell.today .ts-cal-daynum { color: var(--accent); }
      .ts-cal-dots { display:flex; gap:3px; align-items:center; }
      .ts-cal-dot { width:5px; height:5px; border-radius:50%; }
      .ts-cal-more { font-size:9px; color: var(--text-muted); }
      .ts-calendar-side { display:flex; flex-direction:column; gap:16px; }
      .ts-mini-list { display:flex; flex-direction:column; gap:10px; }
      .ts-mini-item { display:flex; gap:10px; align-items:flex-start; }
      .ts-mini-dot { width:7px; height:7px; border-radius:50%; margin-top:5px; flex-shrink:0; }
      .ts-mini-item p { font-size:13px; margin:0; font-weight:500; }
      .ts-mini-item span { font-size:11.5px; color: var(--text-soft); }

      /* ---- Weekly planner ---- */
      .ts-week-nav { display:flex; align-items:center; gap:10px; font-size:13px; color: var(--text-soft); }
      .ts-week-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap:10px; }
      .ts-week-col {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 14px; padding: 12px; min-height: 220px;
        transition: border-color .15s;
      }
      .ts-week-col.today { border-color: var(--accent); box-shadow: 0 0 0 1px rgba(109,93,252,0.15); }
      .ts-week-col-head { display:flex; flex-direction:column; gap:2px; margin-bottom:10px; }
      .ts-week-col-head > span:first-child { font-size:12px; font-weight:700; color: var(--text); }
      .ts-week-col-date { font-size:10.5px; color: var(--text-muted); }
      .ts-week-col.today .ts-week-col-head > span:first-child { color: var(--accent); }
      .ts-week-col-body { display:flex; flex-direction:column; gap:8px; }
      .ts-week-item { background: var(--surface-2); border-left: 3px solid; border-radius: 8px; padding: 7px 9px; }
      .ts-week-item p { font-size:12px; margin:0; font-weight:500; }
      .ts-week-item span { font-size:10.5px; color: var(--text-soft); }
      .ts-week-empty { font-size:11.5px; color: var(--text-muted); text-align:center; margin-top:24px; }

      /* ---- Notes ---- */
      .ts-notes-layout { display:grid; grid-template-columns: 300px 1fr; gap:18px; height: 580px; }
      .ts-notes-list-panel {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 16px; padding: 16px; display:flex; flex-direction:column; overflow:hidden;
      }
      .ts-notes-list { overflow-y:auto; display:flex; flex-direction:column; gap:4px; flex:1; }
      .ts-note-row {
        text-align:left; background:transparent; border:none; border-radius:10px;
        padding:10px; display:flex; flex-direction:column; gap:3px;
        transition: background .12s;
      }
      .ts-note-row:hover { background: var(--surface-2); }
      .ts-note-row.active { background: var(--accent-soft); }
      .ts-note-row-title { font-size:13px; font-weight:600; margin:0; color: var(--text); }
      .ts-note-row-preview { font-size:11.5px; color: var(--text-soft); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ts-note-row-date { font-size:10px; color: var(--text-muted); }
      .ts-note-editor {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 16px; padding: 20px; display:flex; flex-direction:column;
      }
      .ts-note-editor-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      .ts-note-title-input {
        background:transparent; border:none; outline:none; color: var(--text);
        font-family:'Space Grotesk',sans-serif; font-size:20px; font-weight:700; width:100%;
      }
      .ts-note-content-input {
        flex:1; background:transparent; border:none; outline:none; resize:none;
        color: var(--text); font-size:14px; line-height:1.7;
      }
      .ts-note-autosave {
        display:flex; align-items:center; gap:5px; font-size:11px;
        color: var(--success); margin-top:10px; font-weight:500;
      }

      /* ---- Pomodoro ---- */
      .ts-pomodoro-layout { display:grid; grid-template-columns: 1.4fr 1fr; gap:18px; }
      .ts-pomodoro-card { display:flex; flex-direction:column; align-items:center; padding-top:24px; }
      .ts-mode-tabs {
        display:flex; gap:8px; background: var(--surface-2); padding:5px;
        border-radius: 12px; margin-bottom: 20px;
      }
      .ts-mode-tab {
        background: transparent; border: none; padding: 8px 18px; border-radius: 9px;
        font-size: 13px; font-weight: 600; color: var(--text-soft);
        transition: all .15s;
      }
      .ts-mode-tab.active { background: var(--gradient); color: white; box-shadow: 0 2px 8px rgba(109,93,252,0.3); }
      .ts-custom-row { display:flex; gap:14px; margin-bottom:16px; width:100%; max-width:320px; }
      .ts-timer-wrap { margin: 14px 0 26px; }
      .ts-timer-center { display:flex; flex-direction:column; align-items:center; gap:4px; }
      .ts-timer-phase { font-size:12px; color: var(--text-muted); text-transform:uppercase; letter-spacing:.08em; font-weight:700; }
      .ts-timer-clock { font-family:'Space Grotesk',sans-serif; font-size:46px; font-weight:700; color: var(--text); }
      .ts-timer-controls { display:flex; gap:12px; margin-bottom:10px; }
      .ts-complete-banner {
        display:flex; align-items:center; gap:8px;
        background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.06));
        color: var(--success); padding: 10px 18px; border-radius:99px;
        font-size:13px; font-weight:600; margin-top:8px;
        border: 1px solid rgba(16,185,129,0.2);
      }
      .ts-pomodoro-side { display:flex; flex-direction:column; gap:16px; }
      .ts-tips { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:10px; font-size:13px; color: var(--text-soft); line-height: 1.6; }

      /* ---- History table ---- */
      .ts-table { width:100%; border-collapse:collapse; }
      .ts-table th {
        text-align:left; font-size:11px; color: var(--text-muted);
        padding: 10px 12px; border-bottom: 1px solid var(--border);
        text-transform: uppercase; letter-spacing: .06em; font-weight: 700;
      }
      .ts-table td { padding:12px; font-size:13.5px; border-bottom:1px solid var(--border-light); }
      .ts-table tr:last-child td { border-bottom:none; }
      .ts-table tr:hover td { background: var(--surface-2); }

      /* ---- Analytics charts ---- */
      .ts-chart-grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
      .ts-legend { display:flex; gap:14px; justify-content:center; margin-top:8px; flex-wrap:wrap; }
      .ts-legend span { display:flex; align-items:center; gap:6px; font-size:12px; color: var(--text-soft); font-weight:500; }
      .ts-legend i { width:8px; height:8px; border-radius:50%; display:inline-block; }

      /* ---- Goals ---- */
      .ts-goal-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; }
      .ts-goal-card { display:flex; flex-direction:column; gap:8px; }
      .ts-goal-card.achieved { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.02); }
      .ts-goal-top { display:flex; justify-content:space-between; align-items:flex-start; }
      .ts-goal-card h4 { font-size:15px; }

      /* ---- Settings ---- */
      .ts-settings-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:16px; }
      .ts-setting-row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border-light); gap:14px; }
      .ts-setting-row:last-child { border-bottom:none; }
      .ts-setting-title { font-size:13.5px; font-weight:600; margin:0; }
      .ts-setting-desc { font-size:12px; color: var(--text-soft); margin:2px 0 0; line-height:1.5; }
      .ts-switch { position:relative; width:42px; height:24px; flex-shrink:0; }
      .ts-switch input { opacity:0; width:0; height:0; }
      .ts-switch span { position:absolute; inset:0; background: var(--ring-track); border-radius:99px; transition:.2s; }
      .ts-switch span::before { content:''; position:absolute; width:18px; height:18px; left:3px; top:3px; background:white; border-radius:50%; transition:.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
      .ts-switch input:checked + span { background: var(--gradient); }
      .ts-switch input:checked + span::before { transform: translateX(18px); }
      .ts-divider { border:none; border-top:1px solid var(--border); margin:14px 0; }

      /* ---- Login screen ---- */
      .ts-login-screen {
        min-height: 100vh; display:flex; align-items:center; justify-content:center;
        background: #F8FAFC; font-family:'Inter',sans-serif; color: var(--text);
        position: relative; overflow: hidden;
      }
      [data-ts-theme="dark"] .ts-login-screen { background: #0B0E14; }

      /* Decorative background blobs */
      .ts-login-blob {
        position: absolute; border-radius: 50%;
        filter: blur(80px); pointer-events: none;
      }
      .ts-blob-1 {
        width: 500px; height: 500px; top: -100px; left: -150px;
        background: radial-gradient(circle, rgba(109,93,252,0.12), transparent 70%);
      }
      .ts-blob-2 {
        width: 400px; height: 400px; bottom: -80px; right: -100px;
        background: radial-gradient(circle, rgba(236,72,153,0.10), transparent 70%);
      }

      .ts-login-card {
        background: rgba(255,255,255,0.85);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(229,231,235,0.8);
        border-radius: 24px; padding: 40px 38px; width: 100%; max-width: 400px;
        text-align: center; box-shadow: 0 20px 60px rgba(109,93,252,0.12), 0 4px 20px rgba(0,0,0,0.06);
        position: relative; z-index: 1;
      }
      [data-ts-theme="dark"] .ts-login-card {
        background: rgba(17,21,31,0.85);
        border-color: rgba(34,40,56,0.8);
      }

      .ts-login-mark { margin: 0 auto 20px; }
      .ts-login-mark-inner {
        width: 60px; height: 60px; border-radius: 18px;
        background: var(--gradient);
        color: white; display: flex; align-items: center; justify-content: center;
        margin: 0 auto;
        box-shadow: 0 8px 24px rgba(109,93,252,0.4);
      }

      .ts-login-title {
        font-size: 26px; font-weight: 700; margin-bottom: 4px;
        background: var(--gradient); -webkit-background-clip:text;
        -webkit-text-fill-color: transparent; background-clip: text;
      }
      .ts-login-tagline { color: var(--text-soft); font-size: 13px; margin: 0 0 24px; letter-spacing: .03em; }

      /* Tab switcher on login */
      .ts-login-tabs {
        display: flex; gap: 4px; background: var(--surface-2);
        padding: 4px; border-radius: 12px; margin-bottom: 24px;
      }
      .ts-login-tab {
        flex: 1; padding: 9px 12px; border-radius: 9px; border: none;
        background: transparent; color: var(--text-soft);
        font-size: 13px; font-weight: 600; transition: all .15s;
      }
      .ts-login-tab.active {
        background: var(--surface); color: var(--accent);
        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      }

      .ts-login-form-area { text-align:left; }
      .ts-login-form-area .ts-field { text-align:left; }

      .ts-login-cta { width: 100%; margin-top: 14px; justify-content: center; }

      .ts-login-error {
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        color: var(--danger); background: rgba(239,68,68,0.08);
        border-radius: 10px; padding: 10px 12px; font-size: 12.5px;
        margin-top: 12px; font-weight: 500;
      }
      .ts-login-link {
        background: none; border: none; color: var(--accent);
        font-size: 12.5px; font-weight: 600; padding: 0; text-decoration: underline;
      }
      .ts-login-success {
        display: flex; align-items: center; gap: 8px; justify-content: center;
        color: var(--success); background: rgba(16,185,129,0.10);
        border-radius: 10px; padding: 12px; font-size: 13px; font-weight: 600;
        margin-top: 14px;
      }
      .ts-login-hint { font-size: 11.5px; color: var(--text-muted); margin: 18px 0 0; }

      @keyframes ts-shake { 0%,100%{transform:translateX(0);} 25%{transform:translateX(-8px);} 75%{transform:translateX(8px);} }
      .shake { animation: ts-shake .4s; }

      /* ---- Toast ---- */
      .ts-toast-stack { position:fixed; top:18px; right:18px; display:flex; flex-direction:column; gap:8px; z-index:200; }
      .ts-toast {
        display: flex; align-items: center; gap: 9px;
        background: var(--surface); border: 1px solid var(--border);
        color: var(--text); padding: 11px 16px; border-radius: 12px;
        font-size: 13px; font-weight: 500; box-shadow: var(--shadow);
        animation: ts-toast-in .25s cubic-bezier(.2,.8,.4,1);
      }
      .ts-toast.success { border-color: rgba(16,185,129,0.3); color: var(--success); }
      @keyframes ts-toast-in { from{opacity:0; transform:translateX(20px) scale(.97);} to{opacity:1; transform:translateX(0) scale(1);} }

      /* ---- Confetti ---- */
      .ts-confetti-layer { position:fixed; inset:0; pointer-events:none; z-index:300; overflow:hidden; }
      .ts-confetti-piece { position:absolute; top:-20px; border-radius:2px; animation: ts-fall linear forwards; }
      @keyframes ts-fall { to{ transform: translateY(110vh) translateX(var(--drift)) rotate(var(--rot)); opacity:.3; } }

      /* ---- Empty state ---- */
      .ts-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding: 56px 20px; color: var(--text-soft); text-align:center; }
      .ts-empty-icon { width:52px; height:52px; border-radius:16px; background: var(--surface-2); border: 1px solid var(--border); display:flex; align-items:center; justify-content:center; color: var(--text-muted); }
      .ts-empty-title { font-size:14px; font-weight:600; color: var(--text); margin:0; }
      .ts-empty-hint { font-size:12.5px; margin:0; max-width:280px; color: var(--text-muted); line-height:1.6; }

      /* ---- More grid (mobile modal) ---- */
      .ts-more-grid { display:grid; grid-template-columns: repeat(2,1fr); gap:10px; }
      .ts-more-item { display:flex; align-items:center; gap:10px; padding:14px; border-radius:12px; background: var(--surface-2); border:1px solid var(--border); color: var(--text); font-size:13px; font-weight:500; }
      .ts-more-item.active { background: var(--accent-soft); color: var(--accent); border-color: rgba(109,93,252,0.2); }

      /* ---- Mobile responsiveness ---- */
      @media (max-width: 980px){
        .ts-app { grid-template-columns: 1fr; }
        .ts-sidebar { display:none; }
        .ts-mobile-bar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 18px; background: var(--surface); border-bottom:1px solid var(--border);
          position: sticky; top: 0; z-index: 50;
        }
        .ts-mobile-nav {
          display: flex; position: fixed; bottom: 0; left: 0; right: 0;
          background: var(--surface); border-top:1px solid var(--border);
          z-index: 60; padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
        }
        .ts-mobile-nav-item {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
          background: transparent; border: none; color: var(--text-soft);
          font-size: 10.5px; padding: 6px 2px; border-radius: 10px;
        }
        .ts-mobile-nav-item.active { color: var(--accent); }
        .ts-main { padding: 18px 16px 0; }
        .ts-dash-hero { flex-direction:column; padding: 20px; }
        .ts-hero-stats { width:100%; justify-content:space-around; }
        .ts-stat-grid { grid-template-columns: repeat(2, 1fr); }
        .ts-stat-grid[style*="5"] { grid-template-columns: repeat(2,1fr) !important; }
        .ts-task-grid { grid-template-columns: 1fr; }
        .ts-calendar-layout { grid-template-columns: 1fr; }
        .ts-week-grid { grid-template-columns: 1fr; }
        .ts-notes-layout { grid-template-columns: 1fr; height:auto; }
        .ts-notes-list-panel { height:240px; }
        .ts-note-editor { min-height:340px; }
        .ts-pomodoro-layout { grid-template-columns: 1fr; }
        .ts-chart-grid { grid-template-columns: 1fr; }
        .ts-goal-grid { grid-template-columns: 1fr; }
        .ts-settings-grid { grid-template-columns: 1fr; }
        .ts-form-row { grid-template-columns: 1fr; }
        .ts-timer-clock { font-size:38px; }
      }
      @media (min-width: 981px){ .ts-mobile-spacer { display:none; } }
    `}</style>
  );
}
