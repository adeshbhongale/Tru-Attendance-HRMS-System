import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Briefcase, Camera, Download, Mail, Phone, Save, Search, Shield, ShieldCheck, Smartphone, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import api from '../api/axios';
import { setCredentials } from '../store/authSlice';

const Profile = () => {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employeeVersions, setEmployeeVersions] = useState([]);
  const [versionSearch, setVersionSearch] = useState('');

  const userRole = (user?.role || '').toLowerCase();
  const userRoleCode = (user?.roleCode || '').toUpperCase();
  const isDeptSubAdmin = [
    'hr_admin', 'hr', 'store_admin', 'store', 'store_manager',
    'account_admin', 'accounts_admin', 'accounts', 'finance'
  ].includes(userRole) || ['HR_ADMIN', 'STORE_ADMIN', 'ACCOUNT_ADMIN', 'ACCOUNTS_ADMIN'].includes(userRoleCode);
  const isSuperAdmin = !isDeptSubAdmin && (
    userRole === 'superadmin' ||
    userRole === 'super_admin' ||
    userRoleCode === 'TCSA1' ||
    user?.scope === 'GLOBAL'
  );

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    mobile: user?.mobile || '',
    profileImage: user?.profileImage || '',
    androidApkUrl: '',
    iosAppUrl: '',
    minAndroidVersion: '1.0.0',
    minAndroidVersionCode: 1,
    forceUpdateEnabled: false,
    updateMessage: ''
  });

  const [savedSettings, setSavedSettings] = useState({
    androidApkUrl: '',
    iosAppUrl: '',
    minAndroidVersion: '1.0.0',
    minAndroidVersionCode: 1,
    forceUpdateEnabled: false,
    updateMessage: ''
  });

  // Sync form data with Redux state if it changes and fetch office settings
  useEffect(() => {
    if (user) {
      setFormData((prev) => ({
        ...prev,
        name: user.name || '',
        email: user.email || '',
        mobile: user.mobile || '',
        profileImage: user.profileImage || ''
      }));
    }

    if (!isSuperAdmin) return;

    const fetchOfficeSettings = async () => {
      try {
        const res = await api.get('/settings/office');
        if (res.data && res.data.data) {
          const links = {
            androidApkUrl: res.data.data.androidApkUrl || '',
            iosAppUrl: res.data.data.iosAppUrl || '',
            minAndroidVersion: res.data.data.minAndroidVersion || '1.0.0',
            minAndroidVersionCode: res.data.data.minAndroidVersionCode || 1,
            forceUpdateEnabled: Boolean(res.data.data.forceUpdateEnabled),
            updateMessage: res.data.data.updateMessage || ''
          };
          setSavedSettings(links);
          setFormData((prev) => ({
            ...prev,
            ...links
          }));
        }
      } catch (err) {
        console.error('Failed to fetch office settings', err);
      }
    };
    fetchOfficeSettings();
    api.get('/employees?all=true').then((r) => {
      if (Array.isArray(r.data?.data)) setEmployeeVersions(r.data.data);
    }).catch(() => { });
  }, [user, isSuperAdmin]);

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, profileImage: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMobileChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setFormData({ ...formData, mobile: val });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.mobile.length !== 10) {
      return toast.error('Mobile number must be exactly 10 digits');
    }

    try {
      setLoading(true);
      // Update profile details
      const res = await api.put('/auth/updatedetails', {
        name: formData.name,
        email: formData.email,
        mobile: formData.mobile,
        profileImage: formData.profileImage
      });
      dispatch(setCredentials({ ...user, ...res.data.data }));

      // Save dynamic download links and force update settings (Super Admin only)
      if (isSuperAdmin) {
        const settingsRes = await api.put('/settings/office', {
          androidApkUrl: formData.androidApkUrl,
          iosAppUrl: formData.iosAppUrl,
          minAndroidVersion: formData.minAndroidVersion,
          minAndroidVersionCode: Number(formData.minAndroidVersionCode) || 1,
          forceUpdateEnabled: Boolean(formData.forceUpdateEnabled),
          updateMessage: formData.updateMessage
        });
        if (settingsRes.data && settingsRes.data.data) {
          const links = {
            androidApkUrl: settingsRes.data.data.androidApkUrl || '',
            iosAppUrl: settingsRes.data.data.iosAppUrl || '',
            minAndroidVersion: settingsRes.data.data.minAndroidVersion || '1.0.0',
            minAndroidVersionCode: settingsRes.data.data.minAndroidVersionCode || 1,
            forceUpdateEnabled: Boolean(settingsRes.data.data.forceUpdateEnabled),
            updateMessage: settingsRes.data.data.updateMessage || ''
          };
          setSavedSettings(links);
          setFormData((prev) => ({
            ...prev,
            ...links
          }));
        }
      }

      toast.success(isSuperAdmin ? 'Profile and app update settings saved successfully' : 'Profile updated successfully');
      setIsEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-up">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Admin Profile</h2>
        <p className="text-slate-500 font-bold text-xs mt-2 tracking-widest ">System Control Center</p>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden relative">
        {/* Banner */}
        <div className="h-40 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="absolute top-6 right-8 px-6 py-2.5 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-2xl text-[11px] font-bold hover:bg-white/20 transition-all shadow-xl active:scale-95 z-30"
            >
              Edit Profile
            </button>
          )}
        </div>

        <div className="px-10 pb-12">
          {/* Profile Header */}
          <div className="relative -mt-20 flex flex-col md:flex-row items-end gap-8 mb-12">
            <div className="relative group">
              <div className="w-40 h-40 rounded-[3rem] bg-white p-2 shadow-2xl relative z-10 overflow-hidden border border-slate-50">
                {formData.profileImage ? (
                  <img src={formData.profileImage} className="w-full h-full object-cover rounded-[2.8rem]" alt="Profile" />
                ) : (
                  <div className="w-full h-full rounded-[2.8rem] bg-indigo-600 text-white flex items-center justify-center text-5xl font-bold">
                    {user?.name?.charAt(0)}
                  </div>
                )}
                {isEditing && (
                  <label className="absolute inset-2 bg-black/40 backdrop-blur-sm rounded-[2.8rem] flex flex-col items-center justify-center text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <Camera size={24} className="mb-1" />
                    <span className="text-[10px] font-bold">Change</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                  </label>
                )}
              </div>
              <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-[3.2rem] opacity-20 blur-xl group-hover:opacity-40 transition-opacity" />
            </div>

            <div className="flex-1 pb-4">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{user?.name}</h3>
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-bold border border-emerald-100 flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  VERIFIED ADMIN
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-slate-400">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-indigo-500" />
                  <span className="text-xs font-bold">{user?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className="text-violet-500" />
                  <span className="text-xs font-bold capitalize">{user?.role} Access</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form / Details */}
          <AnimatePresence mode="wait">
            {isEditing ? (
              <motion.form
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleSubmit}
                className="grid grid-cols-1 md:grid-cols-2 gap-8"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 shadow-inner"
                      placeholder="Enter your name"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 shadow-inner"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">Mobile Number (10 Digits)</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={formData.mobile}
                      onChange={handleMobileChange}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 shadow-inner"
                      placeholder="Enter 10-digit mobile number"
                      required
                    />
                  </div>
                </div>
                {isSuperAdmin && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">Android APK Download Link</label>
                      <div className="relative">
                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="url"
                          value={formData.androidApkUrl}
                          onChange={(e) => setFormData({ ...formData, androidApkUrl: e.target.value })}
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 shadow-inner"
                          placeholder="Enter Android APK URL"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">iOS App Download Link</label>
                      <div className="relative">
                        <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                          type="url"
                          value={formData.iosAppUrl}
                          onChange={(e) => setFormData({ ...formData, iosAppUrl: e.target.value })}
                          className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white pl-12 pr-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 shadow-inner"
                          placeholder="Enter iOS App URL"
                        />
                      </div>
                    </div>

                    {/* Force Update & Version Management */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">Required Minimum Version Code (Build)</label>
                      <input
                        type="number"
                        value={formData.minAndroidVersionCode}
                        onChange={(e) => setFormData({ ...formData, minAndroidVersionCode: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 shadow-inner"
                        placeholder="e.g. 2"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">Required Minimum Version Name</label>
                      <input
                        type="text"
                        value={formData.minAndroidVersion}
                        onChange={(e) => setFormData({ ...formData, minAndroidVersion: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-4 py-3.5 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 shadow-inner"
                        placeholder="e.g. 1.0.1"
                      />
                    </div>

                    <div className="md:col-span-2 flex items-center gap-3 p-4 bg-amber-50/70 border border-amber-200/70 rounded-2xl">
                      <input
                        type="checkbox"
                        id="forceUpdateToggle"
                        checked={formData.forceUpdateEnabled}
                        onChange={(e) => setFormData({ ...formData, forceUpdateEnabled: e.target.checked })}
                        className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                      />
                      <label htmlFor="forceUpdateToggle" className="cursor-pointer text-xs font-bold text-amber-950 flex items-center gap-2">
                        <AlertCircle size={15} className="text-amber-600" />
                        Enforce Immediate App Update (Locks older versions until user downloads & installs new APK)
                      </label>
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 tracking-widest ml-1">Update Notice / Release Notes for Mobile Users</label>
                      <textarea
                        value={formData.updateMessage}
                        onChange={(e) => setFormData({ ...formData, updateMessage: e.target.value })}
                        rows={2}
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-4 py-3 rounded-2xl outline-none transition-all text-xs font-semibold text-slate-800 shadow-inner"
                        placeholder="e.g. Critical GPS and battery optimizations. Please install to continue tracking."
                      />
                    </div>
                  </>
                )}

                <div className="md:col-span-2 flex justify-end gap-3 pt-6 border-t border-slate-50 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setFormData({
                        name: user?.name || '',
                        email: user?.email || '',
                        mobile: user?.mobile || '',
                        profileImage: user?.profileImage || '',
                        androidApkUrl: savedSettings.androidApkUrl,
                        iosAppUrl: savedSettings.iosAppUrl,
                        minAndroidVersion: savedSettings.minAndroidVersion,
                        minAndroidVersionCode: savedSettings.minAndroidVersionCode,
                        forceUpdateEnabled: savedSettings.forceUpdateEnabled,
                        updateMessage: savedSettings.updateMessage
                      });
                    }}
                    className="flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-slate-600 rounded-2xl text-[11px] font-bold transition-all"
                  >
                    <X size={16} /> Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[11px] font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 active:scale-95"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    Save Changes
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-6"
              >
                {[
                  { label: 'Full Name', value: user?.name, icon: <User size={18} />, color: 'bg-indigo-50 text-indigo-600' },
                  { label: 'Email Address', value: user?.email, icon: <Mail size={18} />, color: 'bg-violet-50 text-violet-600' },
                  { label: 'Mobile Number', value: user?.mobile, icon: <Phone size={18} />, color: 'bg-purple-50 text-purple-600' },
                  {
                    label: 'Role & Department',
                    value: `${user?.role || 'Admin'} - ${(typeof user?.department === 'object' ? user?.department?.name : user?.department) || 'Administration'}`,
                    icon: <Briefcase size={18} />,
                    color: 'bg-emerald-50 text-emerald-600'
                  },
                  {
                    label: 'System Role Code',
                    value: user?.roleCode || (user?.role === 'super_admin' ? 'TCSA1' : user?.role === 'company_admin' ? 'TCCA1' : 'TCSA1'),
                    icon: <Shield size={18} />,
                    color: 'bg-amber-50 text-amber-600'
                  }
                ].map((item, idx) => (
                  <div key={idx} className="p-6 rounded-3xl bg-slate-50/50 border border-slate-100 hover:border-indigo-100 hover:bg-white hover:shadow-xl hover:shadow-slate-100 transition-all group">
                    <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform`}>
                      {item.icon}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 tracking-widest  mb-1">{item.label}</p>
                    <p className="text-sm font-bold text-slate-800 break-words">{item.value || 'N/A'}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {isSuperAdmin && (
        <>
          <div className="mt-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 shadow-sm shrink-0">
                <Smartphone size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold text-slate-800">Download Mobile App</p>
                  {savedSettings.forceUpdateEnabled && (
                    <span className="px-2 py-0.5 bg-rose-50 text-rose-600 font-bold text-[9px] rounded-full border border-rose-200">
                      Force Update Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  Access your geo-attendance portal on the go. Required Version: <span className="font-bold text-indigo-600">v{savedSettings.minAndroidVersion || '1.0.0'} (Build {savedSettings.minAndroidVersionCode || 1})</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 shrink-0 w-full md:w-auto justify-end">
              {(savedSettings.androidApkUrl || import.meta.env.VITE_ANDROID_APK_URL) && (
                <a
                  href={savedSettings.androidApkUrl || import.meta.env.VITE_ANDROID_APK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-indigo-100 active:scale-95 text-center justify-center flex-1 md:flex-initial"
                >
                  <Download size={14} /> Android APK
                </a>
              )}
              {(savedSettings.iosAppUrl || import.meta.env.VITE_IOS_APP_URL) && (
                <a
                  href={savedSettings.iosAppUrl || import.meta.env.VITE_IOS_APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-slate-200 active:scale-95 text-center justify-center flex-1 md:flex-initial"
                >
                  <Download size={14} /> iOS App
                </a>
              )}
            </div>
          </div>

          {employeeVersions.length > 0 && (
            <div className="mt-6 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Smartphone size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800">Employee Mobile App Versions</h3>
                  <span className="text-[11px] font-bold text-slate-400 ml-1">
                    ({employeeVersions.filter(e => e.appVersion || e.lastActiveDevice).length} Logged-in)
                  </span>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={versionSearch}
                    onChange={(e) => setVersionSearch(e.target.value)}
                    placeholder="Search employee, mobile, version..."
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-300 focus:bg-white pl-9 pr-8 py-2 rounded-xl outline-none text-xs font-semibold text-slate-700"
                  />
                  {versionSearch && (
                    <button
                      type="button"
                      onClick={() => setVersionSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 tracking-wider">
                      <th className="py-2.5 px-3">Employee</th>
                      <th className="py-2.5 px-3">Mobile</th>
                      <th className="py-2.5 px-3">App Version</th>
                      <th className="py-2.5 px-3">Last Login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs font-semibold text-slate-700">
                    {employeeVersions
                      .filter(e => e.role !== 'superadmin' && e.role !== 'super_admin')
                      .filter(e => {
                        if (!versionSearch.trim()) return true;
                        const q = versionSearch.toLowerCase().trim();
                        const ver = e.appVersion || (e.lastActiveDevice ? '1.0.0' : '');
                        return (
                          (e.name || '').toLowerCase().includes(q) ||
                          (e.mobile || '').toLowerCase().includes(q) ||
                          ver.toLowerCase().includes(q)
                        );
                      })
                      .map((emp) => {
                        const hasLoggedMobile = Boolean(emp.appVersion || emp.lastActiveDevice);
                        const ver = emp.appVersion || (emp.lastActiveDevice ? '1.0.0' : null);
                        const bld = emp.appBuild || (ver === '1.0.0' ? '1' : null);
                        const isOutdated = ver && ver < (savedSettings.minAndroidVersion || '1.0.1');
                        return (
                          <tr key={emp._id} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-3 font-bold text-slate-900">{emp.name}</td>
                            <td className="py-2.5 px-3 text-slate-500">{emp.mobile || '—'}</td>
                            <td className="py-2.5 px-3">
                              {hasLoggedMobile ? (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isOutdated ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                  v{ver}{bld ? ` (Build ${bld})` : ''}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Not logged in on mobile</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-slate-500">
                              {emp.lastLoginAt ? new Date(emp.lastLoginAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Profile;

const Loader2 = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`animate-spin ${className}`}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
