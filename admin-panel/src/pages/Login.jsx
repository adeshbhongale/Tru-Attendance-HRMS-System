import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../store/authSlice';
import toast from 'react-hot-toast';
import { Mail, ShieldCheck, LogIn, Send } from 'lucide-react';
import api from '../api/axios';

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1); // 1: Email, 2: OTP
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!identifier) return toast.error('Please enter email or mobile number');
    
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { identifier });
      toast.success('OTP sent! Check your console for testing.');
      setStep(2);
    } catch (err) {
      console.error('OTP Error:', err);
      toast.error(err.response?.data?.message || 'Failed to send OTP. Check if backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!otp) return toast.error('Please enter OTP');

    setLoading(true);
    try {
      const res = await api.post('/auth/login', { identifier, otp });
      const { token, user } = res.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      dispatch(setCredentials({
        user: user,
        token: token
      }));
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #4f46e5 0%, #0891b2 100%)'
    }}>
      <div className="glass-card animate-fade-in" style={{ padding: '3rem', width: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)' }}>HRMS Admin</h2>
          <p className="text-muted">
            {step === 1 ? 'Enter your email or mobile to receive OTP' : 'Enter the OTP sent to your device'}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOTP} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Email or Mobile Number"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={buttonStyle} disabled={loading}>
              <Send size={20} />
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ position: 'relative' }}>
              <ShieldCheck size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                style={inputStyle}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={buttonStyle} disabled={loading}>
              <LogIn size={20} />
              {loading ? 'Logging in...' : 'Login'}
            </button>
            <button 
              type="button" 
              onClick={() => setStep(1)} 
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const inputStyle = { 
  width: '100%', 
  padding: '0.8rem 1rem 0.8rem 3rem', 
  borderRadius: '12px', 
  border: '1px solid #e2e8f0',
  outline: 'none',
  fontSize: '1rem'
};

const buttonStyle = { 
  width: '100%', 
  padding: '1rem', 
  fontSize: '1.1rem',
  justifyContent: 'center'
};

export default Login;
