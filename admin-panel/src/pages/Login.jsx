import { Eye, EyeOff, Loader2, LogIn, Mail, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { setCredentials } from '../store/authSlice';

const Login = () => {
  const [companyCode, setCompanyCode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!identifier) return toast.error('Please enter Employee ID or Email');
    if (!password) return toast.error('Please enter password');

    setLoading(true);
    try {
      const res = await api.post('/auth/login', {
        companyCode: companyCode.trim().toUpperCase(),
        identifier: identifier.trim(),
        password
      });
      const { token, user } = res.data;

      const userRole = (user.role || '').toLowerCase();
      const userRoleCode = (user.roleCode || '').toUpperCase();
      const allowedWebRoles = [
        'superadmin', 'tcsa1', 'company_admin', 'tcca1', 'admin',
        'hr', 'hr_admin', 'store', 'store_admin', 'store_manager',
        'accounts', 'account_admin', 'finance'
      ];

      const isAllowed = allowedWebRoles.includes(userRole) || allowedWebRoles.includes(userRoleCode.toLowerCase()) || userRole.includes('admin') || userRole.includes('hr') || userRole.includes('store') || userRole.includes('account');

      if (!isAllowed || userRole === 'employee') {
        toast.error('Access denied. Employee accounts cannot log in to the Web Admin Portal. Please use the Mobile App.');
        setLoading(false);
        return;
      }

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      dispatch(setCredentials({
        user: user,
        token: token
      }));
      toast.success('Login Successful');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleIdentifierChange = (val) => {
    if (val.length <= 40) setIdentifier(val);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 sm:p-12">
      <div className="w-full max-w-[440px] animate-fade-up">
        <div className="bg-white rounded-[2.5rem] p-10 md:p-14 border border-slate-100 shadow-2xl shadow-slate-200/60">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-100 transform -rotate-3 hover:rotate-0 transition-transform duration-500 overflow-hidden border border-slate-100 p-3">
              <img src="/favicon.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">TRUCODE ERP</h2>
            <p className="text-slate-400 text-[13px] font-medium">Multi-Tenant Corporate Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {/* Company Code Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Company Code</label>
              </div>
              <div className="relative group">
                <Send size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                <input
                  type="text"
                  placeholder="Company Code"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50/50 border border-slate-200 pl-16 pr-6 py-4 rounded-2xl outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-50/50 transition-all font-bold text-slate-800 placeholder:text-slate-300 text-sm uppercase tracking-wider"
                />
              </div>
            </div>

            {/* Employee ID / Email Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Employee ID / Email</label>
              </div>
              <div className="relative group">
                <Mail size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                <input
                  type="text"
                  placeholder="Employee ID or Email"
                  value={identifier}
                  onChange={(e) => handleIdentifierChange(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200 pl-16 pr-6 py-4 rounded-2xl outline-none focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-50/50 transition-all font-bold text-slate-800 placeholder:text-slate-300 text-sm"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Password</label>
              </div>
              <div className="relative group">
                <ShieldCheck size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200 pl-16 pr-14 py-4 rounded-2xl outline-none focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-50/50 transition-all font-bold text-slate-800 placeholder:text-slate-300 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors p-2"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-4"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <LogIn size={18} />}
              {loading ? 'Authenticating...' : 'Sign In to Portal'}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-400 text-[11px] font-bold tracking-tight opacity-50">
            &copy; 2026 TRUCODE ERP • SINGLE-TENANT AUTHORIZATION ENGINE
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
