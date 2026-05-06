import React from 'react';
import { MapPin, Clock, Calendar } from 'lucide-react';

const Attendance = () => {
  const records = [
    { id: 1, name: 'John Doe', date: '2026-05-06', in: '09:05 AM', out: '06:10 PM', status: 'Present', location: 'Office' },
    { id: 2, name: 'Jane Smith', date: '2026-05-06', in: '09:45 AM', out: '--:--', status: 'Late', location: 'Office' },
    { id: 3, name: 'Bob Wilson', date: '2026-05-06', in: '08:55 AM', out: '--:--', status: 'Present', location: 'Outside' },
    { id: 4, name: 'Alice Brown', date: '2026-05-05', in: '09:10 AM', out: '06:05 PM', status: 'Present', location: 'Office' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Live Tracking</h3>
          <p className="text-muted">32 employees are currently on duty</p>
        </div>
        <button className="btn btn-primary">
          <MapPin size={18} />
          View Live Map
        </button>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>Attendance Log</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input type="date" className="btn" style={{ border: '1px solid #e2e8f0', backgroundColor: 'white' }} />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', backgroundColor: 'rgba(0,0,0,0.01)' }}>
              <th style={{ padding: '1.2rem' }}>Employee</th>
              <th style={{ padding: '1.2rem' }}>Date</th>
              <th style={{ padding: '1.2rem' }}>Punch In</th>
              <th style={{ padding: '1.2rem' }}>Punch Out</th>
              <th style={{ padding: '1.2rem' }}>Location</th>
              <th style={{ padding: '1.2rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={rec.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '1.2rem', fontWeight: 500 }}>{rec.name}</td>
                <td style={{ padding: '1.2rem', color: 'var(--text-muted)' }}>{rec.date}</td>
                <td style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={14} color="#10b981" /> {rec.in}
                  </div>
                </td>
                <td style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={14} color="#ef4444" /> {rec.out}
                  </div>
                </td>
                <td style={{ padding: '1.2rem' }}>
                  <span style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.3rem',
                    color: rec.location === 'Outside' ? '#f59e0b' : 'var(--text-main)'
                  }}>
                    <MapPin size={14} />
                    {rec.location}
                  </span>
                </td>
                <td style={{ padding: '1.2rem' }}>
                  <span style={{ 
                    padding: '0.3rem 0.8rem', 
                    borderRadius: '20px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    backgroundColor: rec.status === 'Present' ? '#dcfce7' : rec.status === 'Late' ? '#fef3c7' : '#fee2e2',
                    color: rec.status === 'Present' ? '#166534' : rec.status === 'Late' ? '#92400e' : '#991b1b'
                  }}>
                    {rec.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Attendance;
