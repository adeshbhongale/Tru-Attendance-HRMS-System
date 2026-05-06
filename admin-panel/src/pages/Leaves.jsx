import React from 'react';
import { Check, X, Clock } from 'lucide-react';

const Leaves = () => {
  const requests = [
    { id: 1, name: 'John Doe', type: 'Sick Leave', range: 'May 10 - May 12', reason: 'Fever and cold', status: 'Pending' },
    { id: 2, name: 'Jane Smith', type: 'Casual Leave', range: 'May 15 - May 15', reason: 'Family function', status: 'Pending' },
    { id: 3, name: 'Bob Wilson', type: 'Paid Leave', range: 'May 20 - May 25', reason: 'Vacation', status: 'Approved' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem', flex: 1, borderLeft: '4px solid #f59e0b' }}>
          <p className="text-muted" style={{ marginBottom: '0.5rem' }}>Pending Requests</p>
          <h3 style={{ fontSize: '1.8rem', margin: 0 }}>12</h3>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', flex: 1, borderLeft: '4px solid #10b981' }}>
          <p className="text-muted" style={{ marginBottom: '0.5rem' }}>Approved Today</p>
          <h3 style={{ fontSize: '1.8rem', margin: 0 }}>5</h3>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', flex: 1, borderLeft: '4px solid #ef4444' }}>
          <p className="text-muted" style={{ marginBottom: '0.5rem' }}>Rejected Today</p>
          <h3 style={{ fontSize: '1.8rem', margin: 0 }}>2</h3>
        </div>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1.2rem', backgroundColor: 'rgba(0,0,0,0.01)', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>Leave Requests</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {requests.map((req) => (
            <div key={req.id} style={{ 
              padding: '1.5rem', 
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <div style={{ width: '45px', height: '45px', borderRadius: '12px', backgroundColor: 'var(--primary-light)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {req.name.charAt(0)}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem' }}>{req.name}</h4>
                  <p className="text-muted" style={{ fontSize: '0.85rem', margin: '0.2rem 0' }}>
                    <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{req.type}</span> • {req.range}
                  </p>
                  <p style={{ fontSize: '0.9rem', margin: 0 }}>"{req.reason}"</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                {req.status === 'Pending' ? (
                  <>
                    <button className="btn" style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
                      <Check size={18} />
                      Approve
                    </button>
                    <button className="btn" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
                      <X size={18} />
                      Reject
                    </button>
                  </>
                ) : (
                  <span style={{ 
                    padding: '0.4rem 1rem', 
                    borderRadius: '20px', 
                    fontSize: '0.8rem', 
                    fontWeight: 600,
                    backgroundColor: req.status === 'Approved' ? '#dcfce7' : '#fee2e2',
                    color: req.status === 'Approved' ? '#166534' : '#991b1b'
                  }}>
                    {req.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Leaves;
