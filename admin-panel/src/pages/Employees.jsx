import React, { useState } from 'react';
import { Search, UserPlus, Filter, Edit2, Trash2 } from 'lucide-react';

const Employees = () => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const employees = [
    { id: 1, name: 'John Doe', email: 'john@example.com', dept: 'IT', role: 'Employee', status: 'Active' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', dept: 'HR', role: 'Employee', status: 'Active' },
    { id: 3, name: 'Bob Wilson', email: 'bob@example.com', dept: 'Sales', role: 'Employee', status: 'Inactive' },
    { id: 4, name: 'Alice Brown', email: 'alice@example.com', dept: 'IT', role: 'Employee', status: 'Active' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '0.7rem 1rem 0.7rem 3rem', 
              borderRadius: '10px', 
              border: '1px solid #e2e8f0',
              outline: 'none'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn" style={{ backgroundColor: 'white', border: '1px solid #e2e8f0' }}>
            <Filter size={18} />
            Filter
          </button>
          <button className="btn btn-primary">
            <UserPlus size={18} />
            Add Employee
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <th style={{ padding: '1.2rem' }}>Name</th>
              <th style={{ padding: '1.2rem' }}>Email</th>
              <th style={{ padding: '1.2rem' }}>Department</th>
              <th style={{ padding: '1.2rem' }}>Status</th>
              <th style={{ padding: '1.2rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
                      {emp.name.charAt(0)}
                    </div>
                    {emp.name}
                  </div>
                </td>
                <td style={{ padding: '1.2rem', color: 'var(--text-muted)' }}>{emp.email}</td>
                <td style={{ padding: '1.2rem' }}>{emp.dept}</td>
                <td style={{ padding: '1.2rem' }}>
                  <span style={{ 
                    padding: '0.3rem 0.8rem', 
                    borderRadius: '20px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    backgroundColor: emp.status === 'Active' ? '#dcfce7' : '#fee2e2',
                    color: emp.status === 'Active' ? '#166534' : '#991b1b'
                  }}>
                    {emp.status}
                  </span>
                </td>
                <td style={{ padding: '1.2rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn" style={{ padding: '0.4rem', backgroundColor: '#f1f5f9' }}><Edit2 size={16} /></button>
                    <button className="btn" style={{ padding: '0.4rem', backgroundColor: '#fee2e2', color: '#ef4444' }}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Employees;
