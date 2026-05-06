import React, { useState } from 'react';
import { MapPin, Navigation, Save } from 'lucide-react';

const Settings = () => {
  const [radius, setRadius] = useState(200);
  const [lat, setLat] = useState(18.5204);
  const [lng, setLng] = useState(73.8567);

  return (
    <div style={{ maxWidth: '800px' }}>
      <h2 style={{ marginBottom: '2rem' }}>Office Geo-Fence Setup</h2>
      
      <div className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Office Latitude</label>
            <div style={{ position: 'relative' }}>
              <Navigation size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="number" 
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                style={{ width: '100%', padding: '0.8rem 1rem 0.8rem 3rem', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none' }}
              />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Office Longitude</label>
            <div style={{ position: 'relative' }}>
              <Navigation size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="number" 
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                style={{ width: '100%', padding: '0.8rem 1rem 0.8rem 3rem', borderRadius: '10px', border: '1px solid #e2e8f0', outline: 'none' }}
              />
            </div>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem' }}>Geo-Fence Radius (Meters)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <input 
              type="range" 
              min="50" 
              max="1000" 
              step="50"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              style={{ flex: 1, accentColor: 'var(--primary)' }}
            />
            <span style={{ 
              padding: '0.5rem 1.5rem', 
              backgroundColor: 'var(--primary)', 
              color: 'white', 
              borderRadius: '8px',
              fontWeight: 700,
              minWidth: '80px',
              textAlign: 'center'
            }}>
              {radius}m
            </span>
          </div>
        </div>

        <div style={{ 
          height: '250px', 
          backgroundColor: '#f1f5f9', 
          borderRadius: '12px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'var(--text-muted)',
          flexDirection: 'column',
          gap: '1rem',
          border: '2px dashed #cbd5e1'
        }}>
          <MapPin size={40} />
          <p>Google Maps Preview will be rendered here</p>
          <p style={{ fontSize: '0.8rem' }}>Location: {lat}, {lng}</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" style={{ padding: '0.8rem 2.5rem' }}>
            <Save size={18} />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
