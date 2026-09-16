import React, { useState, useEffect } from 'react';
import { Save, Plus, X } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const StoreConfiguration = () => {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  
  const [formData, setFormData] = useState({
    department: '',
    teamLead: '',
    employees: [],
    escalationAllowed: [],
    tallyGodownName: '',
    dispatchChecklist: [],
    returnChecklist: []
  });

  const [newChecklistItems, setNewChecklistItems] = useState({ dispatch: '', return: '' });
  const [employeeSearch, setEmployeeSearch] = useState('');

  const filteredEmployees = users.filter(u => 
    u.name.toLowerCase().includes(employeeSearch.toLowerCase()) || 
    (u.employeeIdCode && u.employeeIdCode.toLowerCase().includes(employeeSearch.toLowerCase()))
  );

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setFetching(true);
    try {
      const [depRes, userRes, confRes] = await Promise.all([
        api.get('/departments'),
        api.get('/employees?limit=500'), // fetching employees
        api.get('/store-config').catch(() => ({ data: { data: null } }))
      ]);
      
      setDepartments(depRes.data.data || []);
      setUsers(userRes.data.data || userRes.data.employees || []);
      
      const conf = confRes.data?.data;
      if (conf) {
        setFormData({
          department: conf.department?._id || conf.department || '',
          teamLead: conf.teamLead?._id || conf.teamLead || '',
          employees: conf.employees?.map(e => e._id || e) || [],
          escalationAllowed: conf.escalationAllowed?.map(e => e._id || e) || [],
          tallyGodownName: conf.tallyGodownName || '',
          dispatchChecklist: conf.dispatchChecklist || [],
          returnChecklist: conf.returnChecklist || []
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load initial data');
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiSelect = (name, value) => {
    setFormData(prev => {
      const arr = prev[name];
      if (arr.includes(value)) {
        return { ...prev, [name]: arr.filter(id => id !== value) };
      }
      return { ...prev, [name]: [...arr, value] };
    });
  };

  const addChecklistItem = (type) => {
    const item = newChecklistItems[type];
    if (!item.trim()) return;
    setFormData(prev => ({
      ...prev,
      [`${type}Checklist`]: [...prev[`${type}Checklist`], item.trim()]
    }));
    setNewChecklistItems(prev => ({ ...prev, [type]: '' }));
  };

  const removeChecklistItem = (type, index) => {
    setFormData(prev => {
      const list = [...prev[`${type}Checklist`]];
      list.splice(index, 1);
      return { ...prev, [`${type}Checklist`]: list };
    });
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      await api.post('/store-config', formData);
      toast.success('Store configuration saved successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="p-8 text-center text-slate-500 font-medium">Loading store configuration...</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8 max-w-5xl mx-auto my-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-6 border-b border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Store Workflow Configuration</h1>
          <p className="text-sm text-slate-500 mt-1">Manage department, location, users, and Tally godown settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={loading}
          className="mt-4 sm:mt-0 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm shadow-indigo-200"
        >
          <Save size={18} />
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* General Settings */}
        <div className="space-y-5 bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <span className="w-2 h-6 bg-indigo-500 rounded-full"></span>
            General Mapping
          </h2>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Department</label>
            <select name="department" value={formData.department} onChange={handleChange} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all">
              <option value="">Select Store Department</option>
              {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tally Godown Name <span className="text-red-500">*</span></label>
            <input type="text" name="tallyGodownName" value={formData.tallyGodownName} onChange={handleChange} placeholder="e.g., GOKUL SHIRGAON" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" required />
            <p className="text-xs text-slate-500 mt-1">This name MUST exactly match the godown name in Tally.</p>
          </div>
        </div>

        {/* User Mapping */}
        <div className="space-y-5 bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <span className="w-2 h-6 bg-teal-500 rounded-full"></span>
            User Roles
          </h2>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Team Lead / Manager <span className="text-red-500">*</span></label>
            <select name="teamLead" value={formData.teamLead} onChange={handleChange} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all">
              <option value="">Select Team Lead</option>
              {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.employeeIdCode || 'N/A'})</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1">This person will do the final checklist and approve the dispatch/return.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">Store Employees (Multiple)</label>
              <input 
                type="text" 
                placeholder="Search name..." 
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-teal-500 w-32"
              />
            </div>
            
            {/* Selected Employees Chips */}
            {formData.employees.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 p-2 bg-white border border-slate-200 rounded-xl">
                {formData.employees.map(empId => {
                  const emp = users.find(u => u._id === empId);
                  if (!emp) return null;
                  return (
                    <span key={`sel-${emp._id}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200">
                      {emp.name}
                      <button onClick={() => handleMultiSelect('employees', emp._id)} className="hover:text-teal-900 focus:outline-none">
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl p-2">
              {filteredEmployees.map(u => (
                <label key={`emp-${u._id}`} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={formData.employees.includes(u._id)} onChange={() => handleMultiSelect('employees', u._id)} className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                  <span className="text-sm font-medium text-slate-700">{u.name} <span className="text-slate-400 font-normal">({u.employeeIdCode})</span></span>
                </label>
              ))}
              {filteredEmployees.length === 0 && <div className="text-xs text-slate-500 p-2 text-center">No employees found.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        {/* Dispatch Checklist */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
            Dispatch Checklist
          </h2>
          <div className="flex gap-2">
            <input type="text" value={newChecklistItems.dispatch} onChange={(e) => setNewChecklistItems(prev => ({...prev, dispatch: e.target.value}))} onKeyDown={(e) => e.key === 'Enter' && addChecklistItem('dispatch')} placeholder="Add checklist item..." className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            <button onClick={() => addChecklistItem('dispatch')} className="bg-blue-100 text-blue-700 p-2 rounded-xl hover:bg-blue-200 transition-colors"><Plus size={20}/></button>
          </div>
          <ul className="space-y-2">
            {formData.dispatchChecklist.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 group">
                <span className="text-sm text-slate-700 font-medium">{item}</span>
                <button onClick={() => removeChecklistItem('dispatch', idx)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={16}/></button>
              </li>
            ))}
            {formData.dispatchChecklist.length === 0 && <li className="text-sm text-slate-400 italic">No checklist items added.</li>}
          </ul>
        </div>

        {/* Return Checklist */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <span className="w-2 h-6 bg-orange-500 rounded-full"></span>
            Return Checklist
          </h2>
          <div className="flex gap-2">
            <input type="text" value={newChecklistItems.return} onChange={(e) => setNewChecklistItems(prev => ({...prev, return: e.target.value}))} onKeyDown={(e) => e.key === 'Enter' && addChecklistItem('return')} placeholder="Add checklist item..." className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
            <button onClick={() => addChecklistItem('return')} className="bg-orange-100 text-orange-700 p-2 rounded-xl hover:bg-orange-200 transition-colors"><Plus size={20}/></button>
          </div>
          <ul className="space-y-2">
            {formData.returnChecklist.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 group">
                <span className="text-sm text-slate-700 font-medium">{item}</span>
                <button onClick={() => removeChecklistItem('return', idx)} className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={16}/></button>
              </li>
            ))}
            {formData.returnChecklist.length === 0 && <li className="text-sm text-slate-400 italic">No checklist items added.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default StoreConfiguration;
