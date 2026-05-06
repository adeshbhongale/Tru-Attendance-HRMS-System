import React from 'react';
import { Clock, Plus, Edit2, Trash2 } from 'lucide-react';

const Shifts = () => {
  const shifts = [
    { id: 1, name: 'General Shift', start: '09:00 AM', end: '06:00 PM', grace: '15 mins', late: 'Applicable' },
    { id: 2, name: 'Night Shift', start: '10:00 PM', end: '07:00 AM', grace: '15 mins', late: 'Applicable' },
    { id: 3, name: 'Evening Shift', start: '02:00 PM', end: '11:00 PM', grace: '30 mins', late: 'No' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Shift Management</h2>
        <button className="btn btn-primary">
          <Plus size={18} />
          Create New Shift
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {shifts.map((shift) => (
          <div key={shift.id} className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div style={{ padding: '0.8rem', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', color: 'var(--primary)' }}>
                <Clock size={24} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn" style={{ padding: '0.4rem', backgroundColor: '#f1f5f9' }}><Edit2 size={16} /></button>
                <button className="btn" style={{ padding: '0.4rem', backgroundColor: '#fee2e2', color: '#ef4444' }}><Trash2 size={16} /></button>
              </div>
            </div>
            
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>{shift.name}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted">Timing</span>
                <span style={{ fontWeight: 600 }}>{shift.start} - {shift.end}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted">Grace Period</span>
                <span style={{ fontWeight: 600 }}>{shift.grace}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted">Late Rules</span>
                <span style={{ fontWeight: 600, color: shift.late === 'Applicable' ? 'var(--primary)' : 'var(--text-muted)' }}>{shift.late}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Shifts;
