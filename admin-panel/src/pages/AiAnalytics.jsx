import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCcw,
  Search,
  Sparkles,
  Calendar,
  Coffee,
  MapPin,
  Moon,
  AlertCircle,
  FileText,
  Trophy
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const colorMap = {
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
  rose: { bg: "bg-rose-50", text: "text-rose-600" },
  sky: { bg: "bg-sky-50", text: "text-sky-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-600" }
};

const CustomDropdown = ({ options, selected, onSelect, icon: Icon, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between pl-14 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
      >
        <div className="flex items-center gap-3">
          <Icon className="absolute left-5 text-slate-400" size={18} />
          <span>{selected === 'All' ? placeholder : selected}</span>
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute z-50 w-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden max-h-60 overflow-y-auto no-scrollbar"
          >
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onSelect(opt);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-6 py-3 text-sm font-bold transition-colors ${selected === opt
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                {opt === 'All' ? placeholder : opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CompactStatItem = ({ label, value, icon: Icon, color = "indigo" }) => {
  const classes = colorMap[color] || colorMap.indigo;
  return (
    <div className="bg-slate-50/60 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${classes.bg} ${classes.text} shrink-0`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold text-slate-400 tracking-wider truncate">{label}</p>
        <p className="text-xs font-extrabold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
};

const AiAnalytics = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFallback, setIsFallback] = useState(false);

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [expandedEmployeeId, setExpandedEmployeeId] = useState(null);

  useEffect(() => {
    const cachedData = localStorage.getItem('ai_leaderboard_cache');
    const cachedFallback = localStorage.getItem('ai_leaderboard_fallback');
    if (cachedData) {
      setData(JSON.parse(cachedData));
      setIsFallback(cachedFallback === 'true');
      setLoading(false);
    } else {
      fetchAIStats();
    }
  }, []);

  const fetchAIStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/ai/analytics');
      const list = res.data?.data || [];
      const fallback = res.data?.isFallback || false;
      // Sort by overall AI score descending
      list.sort((a, b) => b.score - a.score);
      setData(list);
      setIsFallback(fallback);
      localStorage.setItem('ai_leaderboard_cache', JSON.stringify(list));
      localStorage.setItem('ai_leaderboard_fallback', fallback.toString());
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to connect to AI engine. Verify API key.');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedEmployeeId(expandedEmployeeId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 animate-pulse" />
          <BrainCircuit className="text-indigo-600 animate-bounce relative z-10" size={64} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mt-8 tracking-tight">Consulting Gemini AI...</h2>
        <p className="text-slate-500 font-bold text-sm mt-2">Evaluating employee statistics and compiling scores</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6">
        <div className="bg-rose-50 p-8 rounded-[2.5rem] border border-rose-100 max-w-md text-center">
          <AlertTriangle className="text-rose-600 mx-auto mb-4" size={48} />
          <h2 className="text-xl font-bold text-rose-900 tracking-tight">Analysis Interrupted</h2>
          <p className="text-rose-600 font-medium text-sm mt-2 leading-relaxed">{error}</p>
          <button
            onClick={fetchAIStats}
            className="mt-6 bg-rose-600 text-white px-8 py-3 rounded-2xl font-bold text-sm hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
          >
            Retry Evaluation
          </button>
        </div>
      </div>
    );
  }

  // Extract unique departments
  const departments = ['All', ...new Set(data.map(e => e.department))];

  // Filtering Logic
  const filteredData = data.filter(e => {
    const matchesSearch = (e.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDept === 'All' || e.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate('/')}
            className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Workforce AI Analytics</h1>
              {isFallback ? (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-3 py-1 rounded-full tracking-widest flex items-center gap-1.5 shadow-md shadow-amber-50 border border-amber-200">
                  <AlertCircle size={10} className="text-amber-600" /> Gemini API Offline (Fallback Mode)
                </span>
              ) : (
                <span className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full tracking-widest flex items-center gap-1.5 shadow-lg shadow-indigo-100">
                  <Sparkles size={10} /> Powered by Gemini
                </span>
              )}
            </div>
            <p className="text-slate-500 font-bold text-sm mt-1">Employee performance scores based on summary statistics</p>
          </div>
        </div>

        <button
          onClick={fetchAIStats}
          className="flex items-center gap-2 bg-white border border-slate-200 px-6 py-3 rounded-2xl text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm active:scale-95"
        >
          <RefreshCcw size={16} /> Recalculate Scores
        </button>
      </div>

      {/* Warning message if Gemini API is missing / using fallback */}
      {isFallback && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-semibold shadow-sm"
        >
          <AlertCircle size={18} className="text-amber-600 shrink-0" />
          <span>
            <strong>Note:</strong> Gemini AI API key is missing or invalid. Performance scores have been calculated using local weighted HR metrics.
          </span>
        </motion.div>
      )}

      {/* Main Leaderboard Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-slate-100 rounded-[3rem] overflow-hidden shadow-sm"
      >
        {/* Table Toolbar */}
        <div className="p-8 border-b border-slate-50 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <Trophy size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Employee AI Performance Scores</h3>
                <p className="text-slate-400 text-[11px] font-bold tracking-widest mt-0.5">30-Day Automated Evaluation</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
              <input
                type="text"
                placeholder="Search employee by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all"
              />
            </div>

            {/* Department Filter */}
            <CustomDropdown
              options={departments}
              selected={selectedDept}
              onSelect={setSelectedDept}
              icon={Building2}
              placeholder="All Departments"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-5 text-[15px] font-bold text-slate-900 text-center w-30 border border-slate-300">Rank</th>
                <th className="px-8 py-5 text-[15px] font-bold text-slate-900 text-center w-60 border border-slate-300">Employee</th>
                <th className="px-8 py-5 text-[15px] font-bold text-slate-900 text-center w-50 border border-slate-300">Department</th>
                <th className="px-8 py-5 text-[15px] font-bold text-slate-900 text-center w-50 border border-slate-300">AI Score</th>
                <th className="px-8 py-5 text-[15px] font-bold text-slate-900 text-center w-50 border border-slate-300">Statistics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredData.map((emp, index) => {
                const isExpanded = expandedEmployeeId === emp._id;
                const stats = emp.stats || {};

                return (
                  <React.Fragment key={emp._id}>
                    <tr className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-6 border border-slate-300 text-center">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs mx-auto ${index < 3 && searchTerm === '' && selectedDept === 'All' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-8 py-6 border border-slate-300">
                        <div className="flex items-center justify-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-extrabold text-sm">
                            {emp.name.charAt(0)}
                          </div>
                          <span className="font-bold text-slate-900">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-center border border-slate-300">
                        <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-[12px] font-bold tracking-widest">
                          {emp.department}
                        </span>
                      </td>
                      <td className="px-8 py-6 border border-slate-300">
                        <div className="flex flex-col items-center">
                          <span className={`text-lg font-extrabold ${emp.score >= 80 ? 'text-emerald-600' : emp.score >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {emp.score}%
                          </span>
                          <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${emp.score >= 80 ? 'bg-emerald-500' : emp.score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${emp.score}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-center border border-slate-300">
                        <button
                          onClick={() => toggleExpand(emp._id)}
                          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-indigo-600 hover:text-white transition-all text-xs font-bold flex items-center gap-1.5 mx-auto active:scale-95"
                        >
                          {isExpanded ? (
                            <>Hide Stats <ChevronUp size={15} /></>
                          ) : (
                            <>View Stats <ChevronDown size={15} /></>
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Stats details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50/30 p-8 border border-slate-300">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                <CompactStatItem label="Working Days" value={stats.workingDays} icon={Calendar} color="indigo" />
                                <CompactStatItem label="Total Working HR" value={stats.totalWorkingHours} icon={Clock} color="emerald" />
                                <CompactStatItem label="Total Break Time" value={stats.totalBreakTime} icon={Coffee} color="amber" />
                                <CompactStatItem label="Total Distance" value={stats.totalDistance} icon={MapPin} color="violet" />
                                <CompactStatItem label="Current Shift" value={stats.currentShift} icon={Moon} color="sky" />
                                <CompactStatItem label="Current Working HR" value={stats.currentWorkingHours} icon={Clock} color="emerald" />
                                <CompactStatItem label="Current Break" value={stats.currentBreak} icon={Coffee} color="amber" />
                                <CompactStatItem label="Current Distance" value={stats.currentDistance} icon={MapPin} color="violet" />
                                <CompactStatItem label="Late Days" value={stats.lateDays} icon={AlertCircle} color="rose" />
                                <CompactStatItem label="Half Day Count" value={stats.halfDayCount} icon={AlertCircle} color="rose" />
                                <CompactStatItem label="Absent Days" value={stats.absentDays} icon={AlertCircle} color="rose" />
                                <CompactStatItem label="Leave Days" value={stats.leaveDays} icon={FileText} color="indigo" />
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredData.length === 0 && (
            <div className="p-20 text-center text-slate-400 font-bold">
              No employees found matching your search criteria.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default AiAnalytics;
