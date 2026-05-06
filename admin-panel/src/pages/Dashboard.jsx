import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CalendarCheck, 
  Clock, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import api from '../api/axios';

const chartData = [
  { name: 'Mon', attendance: 45 },
  { name: 'Tue', attendance: 52 },
  { name: 'Wed', attendance: 48 },
  { name: 'Thu', attendance: 61 },
  { name: 'Fri', attendance: 55 },
  { name: 'Sat', attendance: 20 },
  { name: 'Sun', attendance: 10 },
];

const StatCard = ({ title, value, icon, color, trend, loading }) => (
  <div className="glass-card" style={{ padding: '1.5rem', flex: 1 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
      <div style={{ 
        padding: '0.8rem', 
        borderRadius: '12px', 
        backgroundColor: `${color}15`, 
        color: color 
      }}>
        {icon}
      </div>
      {trend !== undefined && (
        <span style={{ 
          color: trend > 0 ? '#10b981' : '#ef4444', 
          fontSize: '0.8rem', 
          fontWeight: 600 
        }}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <h3 style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
      {loading ? <Loader2 className="animate-spin" /> : value}
    </h3>
    <p className="text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>{title}</p>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/reports/stats');
        setStats(res.data.data);
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <StatCard 
          title="Total Employees" 
          value={stats?.totalEmployees || 0} 
          icon={<Users />} 
          color="#4f46e5" 
          loading={loading}
        />
        <StatCard 
          title="Present Today" 
          value={stats?.presentToday || 0} 
          icon={<CalendarCheck />} 
          color="#10b981" 
          loading={loading}
        />
        <StatCard 
          title="Late Arrivals" 
          value={stats?.lateToday || 0} 
          icon={<Clock />} 
          color="#f59e0b" 
          loading={loading}
        />
        <StatCard 
          title="Pending Leaves" 
          value={stats?.pendingLeaves || 0} 
          icon={<AlertCircle />} 
          color="#ef4444" 
          loading={loading}
        />
      </div>

      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <div className="glass-card" style={{ flex: 2, padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Attendance Trend</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAttend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: 'var(--card-shadow)',
                    backgroundColor: 'white'
                  }} 
                />
                <Area type="monotone" dataKey="attendance" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorAttend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ flex: 1, padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Department Summary</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={stats?.departmentStats || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="value" fill="var(--secondary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
