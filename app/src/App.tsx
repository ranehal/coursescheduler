import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  LayoutGrid,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Lock,
  Info,
  X,
  Check,
  Star,
  Zap,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CourseData, Course, Section } from './types';
import './App.css';

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Helper to convert 24h to 12h
const to12Hr = (time: string) => {
  const [hrs, mins] = time.split(':').map(Number);
  const suffix = hrs >= 12 ? 'PM' : 'AM';
  const h12 = hrs % 12 || 12;
  return `${h12}:${mins.toString().padStart(2, '0')} ${suffix}`;
};

const TIME_SLOTS = [
    { label: "08:30 - 09:50", start: 510, end: 590 },
    { label: "09:51 - 11:10", start: 591, end: 670 },
    { label: "11:11 - 12:30", start: 671, end: 750 },
    { label: "12:31 - 13:50", start: 751, end: 830 },
    { label: "13:51 - 15:10", start: 831, end: 910 },
    { label: "15:11 - 16:30", start: 911, end: 990 }
];

interface Routine {
  sections: Section[];
  score: number;
  freeDays: number;
  matchPercentage: number;
  facultyPrioritySum: number;
}

const App: React.FC = () => {
  const [data, setData] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'browse' | 'scheduler'>('browse');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  
  const [basket, setBasket] = useState<Course[]>([]);
  const [excludedDays, setExcludedDays] = useState<string[]>([]);
  const [facultyPrios, setFacultyPrios] = useState<Record<string, number>>({}); 
  
  const [solutions, setSolutions] = useState<Routine[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const [timePref, setTimePref] = useState<'any' | 'early' | 'late'>('any');
  const [maxFreeDays, setMaxFreeDays] = useState(true);

  useEffect(() => {
    fetch('/courses.json')
      .then(res => res.json())
      .then((json: CourseData) => {
        setData(json);
        setLoading(false);
      });
  }, []);

  const timeToMinutes = (time: string) => {
    const [hrs, mins] = time.split(':').map(Number);
    return hrs * 60 + mins;
  };

  const hasConflict = (s1: Section, s2: Section) => {
    for (const sch1 of s1.schedule) {
      for (const sch2 of s2.schedule) {
        if (sch1.day === sch2.day) {
          const start1 = timeToMinutes(sch1.start_time);
          const end1 = timeToMinutes(sch1.end_time);
          const start2 = timeToMinutes(sch2.start_time);
          const end2 = timeToMinutes(sch2.end_time);
          if (Math.max(start1, start2) < Math.min(end1, end2)) return true;
        }
      }
    }
    return false;
  };

  const setFacultyPrio = (code: string, level: number) => {
    setFacultyPrios(prev => ({ ...prev, [code]: level }));
  };

  const calculateScore = (sections: Section[]) => {
    let score = 500;
    const daysUsed = new Set<string>();
    let totalStartTime = 0;
    let schedCount = 0;
    let facultyBonus = 0;

    sections.forEach(sec => {
      const prio = facultyPrios[sec.faculty_code] || 3;
      if (prio === 1) facultyBonus += 100;
      if (prio === 2) facultyBonus += 40;

      sec.schedule.forEach(sch => {
        daysUsed.add(sch.day);
        totalStartTime += timeToMinutes(sch.start_time);
        schedCount++;
      });
    });

    score += facultyBonus;
    const freeDays = DAYS.length - daysUsed.size;
    if (maxFreeDays) score += (freeDays * 80);

    const avgStart = totalStartTime / schedCount;
    if (timePref === 'early') score -= (avgStart - 510) / 5;
    if (timePref === 'late') score -= (900 - avgStart) / 5;

    return { 
      score, 
      freeDays, 
      facultyPrioritySum: facultyBonus,
      matchPercentage: Math.min(100, Math.max(0, Math.round((score / 1200) * 100)))
    };
  };

  const generateRoutines = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const results: Routine[] = [];
      const courses = basket;
      
      const backtrack = (courseIdx: number, currentSections: Section[]) => {
        if (courseIdx === courses.length) {
          const stats = calculateScore(currentSections);
          results.push({ sections: [...currentSections], ...stats });
          return;
        }

        const course = courses[courseIdx];
        for (const section of course.sections) {
          if (section.schedule.some(sch => excludedDays.includes(sch.day))) continue;
          if (!currentSections.some(s => hasConflict(s, section))) {
            backtrack(courseIdx + 1, [...currentSections, section]);
          }
        }
      };

      backtrack(0, []);
      const sorted = results.sort((a, b) => b.score - a.score);
      setSolutions(sorted.slice(0, 100));
      setActiveIndex(0);
      setIsGenerating(false);
    }, 100);
  };

  const toggleBasket = (course: Course) => {
    setBasket(prev => {
      const exists = prev.find(c => c.course_code === course.course_code);
      if (exists) return prev.filter(c => c.course_code !== course.course_code);
      if (prev.length >= 8) return prev;
      return [...prev, course];
    });
  };

  const filteredCourses = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.toLowerCase();
    return data.data.courses.filter(c => 
      c.course_name.toLowerCase().includes(q) || c.formal_code.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  if (loading) return <div className="loading">Processing Academic Data...</div>;

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo" onClick={() => setView('browse')} style={{ cursor: 'pointer' }}>
          <Zap size={24} color="#ff9500" fill="#ff9500" />
          <span>CSE</span>Courses
        </div>
        <nav className="nav-actions">
          <button className={`day-btn ${view === 'browse' ? 'active' : ''}`} onClick={() => setView('browse')}>
            <LayoutGrid size={16} /> BROWSE
          </button>
          <button className={`day-btn ${view === 'scheduler' ? 'active' : ''}`} onClick={() => setView('scheduler')}>
            <Sparkles size={16} /> SCHEDULER ({basket.length})
          </button>
        </nav>
      </header>

      {view === 'browse' ? (
        <div className="browse-view">
          <div className="glass-card" style={{ marginBottom: 32, padding: '12px 24px' }}>
            <Search size={20} color="#ff9500" style={{ verticalAlign: 'middle', marginRight: 12 }} />
            <input 
              className="search-input" 
              placeholder="Search by Course Name or Code..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#1d1d1f', fontSize: '16px', outline: 'none', width: '80%' }}
            />
          </div>

          <div className="course-grid">
            {filteredCourses.slice(0, 100).map(course => {
              const inBasket = basket.some(c => c.course_code === course.course_code);
              return (
                <div key={course.course_code} className={`course-card ${inBasket ? 'active' : ''}`}>
                  <div>
                    <div className="course-code">{course.formal_code}</div>
                    <div className="course-name">{course.course_name}</div>
                  </div>
                  <div className="card-actions">
                    <button className="icon-btn" onClick={() => setSelectedCourse(course)}><Info size={18} /></button>
                    <button className={`btn-orange ${inBasket ? 'active' : ''}`} style={{ padding: '10px' }} onClick={() => toggleBasket(course)}>
                      {inBasket ? <Check size={16} /> : 'Add to Routine'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="scheduler-layout">
          <aside className="controls-area">
            <div className="glass-card" style={{ marginBottom: 24 }}>
              <h3 className="panel-title"><Lock size={18} /> Constraints</h3>
              <div className="control-group">
                <span className="control-label">Exclude Days</span>
                <div className="day-toggles" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS.map(d => (
                    <button key={d} className={`day-btn ${excludedDays.includes(d) ? 'active' : ''}`} onClick={() => {
                      setExcludedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
                    }}>{d.substring(0,3)}</button>
                  ))}
                </div>
              </div>
              <div className="control-group">
                <label className="control-label">Time Priority</label>
                <select className="day-btn" style={{ width: '100%' }} value={timePref} onChange={(e: any) => setTimePref(e.target.value)}>
                  <option value="any">Flexible Timing</option>
                  <option value="early">Early Start (12h: 8:30 AM)</option>
                  <option value="late">Late Classes</option>
                </select>
              </div>
              <div className="control-group">
                <button className={`day-btn ${maxFreeDays ? 'active' : ''}`} style={{ width: '100%' }} onClick={() => setMaxFreeDays(!maxFreeDays)}>
                  {maxFreeDays ? '✓ Prioritizing Free Days' : 'Prioritize Free Days'}
                </button>
              </div>
              <button className="btn-orange" disabled={isGenerating || basket.length === 0} onClick={generateRoutines}>
                {isGenerating ? 'Computing Matrices...' : 'Generate routines'}
              </button>
            </div>

            <div className="glass-card">
              <h3 className="panel-title"><Star size={18} /> Faculty Priorities</h3>
              <div className="prio-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {basket.flatMap(c => c.sections).reduce((acc: any[], s) => {
                  if (!acc.find(x => x.faculty_code === s.faculty_code)) acc.push(s);
                  return acc;
                }, []).map(s => {
                  const p = facultyPrios[s.faculty_code] || 3;
                  return (
                    <div key={s.faculty_code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{s.faculty_name}</span>
                      <div className="prio-toggle" style={{ display: 'flex', gap: 4 }}>
                        {[1, 2, 3].map(lvl => (
                          <button key={lvl} className={`day-btn ${p === lvl ? 'active' : ''}`} style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => setFacultyPrio(s.faculty_code, lvl)}>
                            P{lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="routine-display">
            {solutions.length > 0 ? (
              <>
                <div className="routine-view-header glass-card" style={{ padding: '16px 32px' }}>
                  <div className="routine-score">
                    <span style={{ fontSize: '24px', fontWeight: 900, color: '#ff9500' }}>{solutions[activeIndex].matchPercentage}%</span>
                    <span style={{ marginLeft: 10, fontSize: '14px', color: '#86868b' }}>Match Score • {solutions[activeIndex].freeDays} Free Days</span>
                  </div>
                  <div className="nav-ctrl" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button className="icon-btn" disabled={activeIndex === 0} onClick={() => setActiveIndex(i => i - 1)}><ChevronLeft /></button>
                    <span style={{ fontWeight: 700 }}>{activeIndex + 1} / {solutions.length}</span>
                    <button className="icon-btn" disabled={activeIndex === solutions.length - 1} onClick={() => setActiveIndex(i => i + 1)}><ChevronRight /></button>
                  </div>
                </div>

                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table className="routine-grid">
                    <thead>
                      <tr>
                        <th className="grid-time-label">12HR TIME</th>
                        {DAYS.map(d => <th key={d} className="grid-day-header">{d.substring(0,3).toUpperCase()}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map((slot, sIdx) => {
                        const label12h = `${to12Hr(slot.label.split(' - ')[0])} - ${to12Hr(slot.label.split(' - ')[1])}`;
                        return (
                          <tr key={sIdx}>
                            <td className="grid-time-label">{label12h}</td>
                            {DAYS.map(day => {
                              const match = solutions[activeIndex].sections.filter(sec => 
                                sec.schedule.some(sch => 
                                  sch.day === day && 
                                  timeToMinutes(sch.start_time) < slot.end && 
                                  timeToMinutes(sch.end_time) > slot.start
                                )
                              );
                              return (
                                <td key={day} className="grid-cell">
                                  {match.map((m, i) => (
                                    <div key={i} className="routine-block">
                                      <div className="block-code">{m.formal_code}</div>
                                      <div className="block-sub">Sec {m.section_name} • {m.faculty_name}</div>
                                    </div>
                                  ))}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="glass-card" style={{ height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <AlertCircle size={48} color="#ff3b30" />
                <h3 style={{ marginTop: 16 }}>No Non-Clashing Matrix Found</h3>
                <p style={{ color: '#86868b' }}>Try removing a course or un-excluding a day.</p>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Modal for Explorer */}
      <AnimatePresence>
        {selectedCourse && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setSelectedCourse(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="glass-card" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '800px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>{selectedCourse.formal_code} // {selectedCourse.course_name}</h2>
                <button className="icon-btn" onClick={() => setSelectedCourse(null)}><X /></button>
              </div>
              <div className="section-list">
                {selectedCourse.sections.map(s => {
                   const p = facultyPrios[s.faculty_code] || 3;
                   return (
                    <div key={s.section_id} className="glass-card" style={{ marginBottom: 12, padding: '16px', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '16px' }}>Section {s.section_name} • {s.faculty_name}</div>
                        <div style={{ fontSize: '12px', color: '#86868b', marginTop: 4 }}>
                          {s.schedule.map((sch, i) => (
                            <span key={i} className="prio-tag prio-p3" style={{ marginRight: 8 }}>
                              {sch.day} {to12Hr(sch.start_time)}-{to12Hr(sch.end_time)}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: '11px', color: '#86868b', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={10} /> Room {s.room_details}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[1, 2, 3].map(l => (
                          <button key={l} className={`day-btn ${p === l ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => setFacultyPrio(s.faculty_code, l)}>
                            P{l}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
