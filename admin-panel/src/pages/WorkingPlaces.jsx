import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft, ChevronRight,
  Download,
  Edit2,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';




const WorkingPlaces = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null });
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    address: '',
    latitude: 18.5204,
    longitude: 73.8567,
    radius: 200,
    geofenceEnabled: true
  });

  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    if (window.L) {
      setLeafletLoaded(true);
      return;
    }
    let link = document.getElementById('leaflet-css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    let script = document.getElementById('leaflet-js');
    if (!script) {
      script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        if (window.L && window.L.Icon && window.L.Icon.Default) {
          delete window.L.Icon.Default.prototype._getIconUrl;
          window.L.Icon.Default.mergeOptions({
            iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
            iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          });
        }
        setLeafletLoaded(true);
      };
      document.head.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if (window.L) {
          if (window.L.Icon && window.L.Icon.Default) {
            delete window.L.Icon.Default.prototype._getIconUrl;
            window.L.Icon.Default.mergeOptions({
              iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
              iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
              shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            });
          }
          setLeafletLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  const mapRef = useRef(null);
  const googleMap = useRef(null);
  const marker = useRef(null);
  const circle = useRef(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings/locations');
      setLocations(res.data.data);
    } catch (err) {
      toast.error('Failed to load working places');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Place Name', 'Address', 'Latitude', 'Longitude', 'Radius (m)', 'Geofence'];
    const data = locations.map(l => [
      l.name,
      l.address || 'N/A',
      l.latitude,
      l.longitude,
      l.radius,
      l.geofenceEnabled ? 'Enabled' : 'Disabled'
    ]);
    const csvContent = [headers, ...data].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "working_places.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const initMap = (lat, lng, rad) => {
    if (!mapRef.current || !window.L) return;
    const pos = [parseFloat(lat), parseFloat(lng)];

    // Always clean up previous map instance to ensure it mounts cleanly on the new modal container DOM element
    if (googleMap.current) {
      try {
        googleMap.current.off();
        googleMap.current.remove();
      } catch (e) {
        console.error("Error removing old map instance:", e);
      }
      googleMap.current = null;
    }

    googleMap.current = window.L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
      maxZoom: 22
    }).setView(pos, 20);

    window.L.tileLayer('https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 22,
      maxNativeZoom: 20
    }).addTo(googleMap.current);

    marker.current = window.L.marker(pos, {
      draggable: true
    }).addTo(googleMap.current);

    circle.current = window.L.circle(pos, {
      radius: parseInt(rad),
      fillColor: "#4f46e5",
      fillOpacity: 0.15,
      color: "#4f46e5",
      opacity: 0.5,
      weight: 2
    });

    if (formData.geofenceEnabled) {
      circle.current.addTo(googleMap.current);
    }

    googleMap.current.on('click', (e) => {
      updateMapPosition(e.latlng.lat, e.latlng.lng);
    });

    marker.current.on('dragend', () => {
      const p = marker.current.getLatLng();
      updateMapPosition(p.lat, p.lng);
    });

    // Call invalidateSize multiple times during animation to guarantee the map loads quickly and fully
    const intervals = [100, 300, 600, 1000];
    intervals.forEach(delay => {
      setTimeout(() => {
        if (googleMap.current) {
          googleMap.current.invalidateSize();
        }
      }, delay);
    });
  };

  const reverseGeocode = (lat, lng) => {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${parseFloat(lat)}&lon=${parseFloat(lng)}`, {
      headers: {
        'Accept-Language': 'en'
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.display_name) {
          setFormData(prev => ({ ...prev, address: data.display_name }));
        }
      })
      .catch(err => {
        console.error('Reverse geocoding error:', err);
      });
  };

  const updateMapPosition = (lat, lng) => {
    const pos = [parseFloat(lat), parseFloat(lng)];
    setFormData(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
    if (marker.current) marker.current.setLatLng(pos);
    if (circle.current) circle.current.setLatLng(pos);
    if (googleMap.current) {
      googleMap.current.setView(pos, 20);
      googleMap.current.invalidateSize();
    }

    // Auto fetch address
    reverseGeocode(lat, lng);
  };

  const handleOpenModal = (loc = null) => {
    if (loc) {
      setEditingLoc(loc);
      setFormData({
        name: loc.name,
        address: loc.address || '',
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius: loc.radius,
        geofenceEnabled: loc.geofenceEnabled
      });
      setShowModal(true);
    } else {
      setEditingLoc(null);
      setFormData({
        name: '',
        address: '',
        latitude: 18.5204,
        longitude: 73.8567,
        radius: 200,
        geofenceEnabled: true
      });
      setShowModal(true);

      // Fetch browser live location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const lat = parseFloat(position.coords.latitude);
            const lng = parseFloat(position.coords.longitude);
            setFormData(prev => ({
              ...prev,
              latitude: lat,
              longitude: lng
            }));
            updateMapPosition(lat, lng);
          },
          (error) => {
            console.error('Error fetching live location:', error);
          },
          { enableHighAccuracy: true }
        );
      }
    }
  };

  const handleRefreshLiveLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = parseFloat(position.coords.latitude);
          const lng = parseFloat(position.coords.longitude);
          setFormData(prev => ({
            ...prev,
            latitude: lat,
            longitude: lng
          }));
          updateMapPosition(lat, lng);
          toast.success('Live location updated');
        },
        (error) => {
          console.error('Error fetching live location:', error);
          toast.error('Failed to get live location');
        },
        { enableHighAccuracy: true }
      );
    } else {
      toast.error('Geolocation is not supported by your browser');
    }
  };

  useEffect(() => {
    if (showModal && leafletLoaded && mapRef.current) {
      setTimeout(() => {
        initMap(formData.latitude, formData.longitude, formData.radius);
      }, 100);
    }
  }, [showModal, leafletLoaded]);

  useEffect(() => {
    if (circle.current && googleMap.current) {
      if (formData.geofenceEnabled) {
        circle.current.addTo(googleMap.current);
      } else {
        circle.current.remove();
      }
    }
  }, [formData.geofenceEnabled]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const data = {
        ...formData,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        radius: parseInt(formData.radius)
      };
      if (editingLoc) {
        await api.put(`/settings/locations/${editingLoc._id}`, data);
        toast.success('Working place updated');
      } else {
        await api.post('/settings/locations', data);
        toast.success('Working place created');
      }
      fetchLocations();
      setShowModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!deleteConfirm.id) return;
    const idToDelete = deleteConfirm.id;
    try {
      await api.delete(`/settings/locations/${idToDelete}`);
      toast.success('Location deleted');
      fetchLocations();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete location');
    }
  };

  const filteredLocations = useMemo(() => {
    return locations.filter(l =>
      (l.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.address?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [locations, searchQuery]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  const totalPages = Math.ceil(filteredLocations.length / itemsPerPage);
  const paginatedData = filteredLocations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      <div className="space-y-6 md:space-y-8 animate-fade-up">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight m-0">Working Places</h2>
            <p className="text-slate-600 font-bold text-[13px] mt-2">Manage office locations and geofencing</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              onClick={exportToCSV}
              className="flex items-center justify-center gap-2 bg-white text-slate-600 border border-slate-200 px-6 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 shadow-sm"
            >
              <Download size={18} />
              Export
            </button>
            <button
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
              onClick={() => handleOpenModal()}
            >
              <Plus size={18} />
              Add New Office
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <div className="relative max-w-md">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 pl-12 pr-4 py-3 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-indigo-100 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50/30">
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">OFFICE NAME</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest border border-slate-200">ADDRESS</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">RADIUS</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-center border border-slate-200">GEOFENCE</th>
                  <th className="px-6 py-5 text-[10px] font-extrabold text-indigo-600 tracking-widest text-right border border-slate-200">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">

                {paginatedData.map((loc) => (

                  <tr key={loc._id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5 border border-slate-200">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                          <MapPin size={20} />
                        </div>
                        <span className="text-sm font-bold text-slate-900">{loc.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 border border-slate-200">
                      <p className="text-sm text-slate-500 max-w-xs truncate">{loc.address || 'No address set'}</p>
                    </td>
                    <td className="px-6 py-5 text-center border border-slate-200">
                      <span className="text-sm font-bold text-slate-700">{loc.radius}m</span>
                    </td>
                    <td className="px-6 py-5 text-center border border-slate-200">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border ${loc.geofenceEnabled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                        }`}>
                        {loc.geofenceEnabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </td>
                    <td className="px-6 py-5 border border-slate-200">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(loc)}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ show: true, id: loc._id })}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLocations.length > itemsPerPage && (
            <div className="flex justify-between items-center px-8 py-5 bg-slate-50/50 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLocations.length)} of {filteredLocations.length} entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-bold text-slate-700 px-2">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-7xl h-full sm:h-[95vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white z-10 shrink-0 sticky top-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tighter m-0">
                    {editingLoc ? 'Edit Working Place' : 'Add Working Place'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 flex flex-col lg:flex-row gap-8">
                <form onSubmit={handleSubmit} className="flex-1 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Office Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      placeholder="e.g., Headquarters"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Office Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      required
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800 min-h-[80px] resize-none"
                      placeholder="Full address of the office..."
                    />
                  </div>

                  <div className="flex justify-between items-center px-1">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest">Office Coordinates</label>
                    <button
                      type="button"
                      onClick={handleRefreshLiveLocation}
                      className="text-[11px] font-bold text-indigo-600 flex items-center gap-1.5 hover:text-indigo-800 transition-all active:scale-95"
                      title="Fetch current location"
                    >
                      <RefreshCw size={12} />
                      Refresh Location
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                        required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest ml-1">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                        required
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-100 focus:bg-white px-5 py-4 rounded-2xl outline-none transition-all text-sm font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[11px] font-bold text-slate-400 tracking-widest">Attendance Radius (Meters)</label>
                      <span className="text-xs font-bold text-indigo-600">{formData.radius}m</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="1000"
                      step="50"
                      value={formData.radius}
                      onChange={(e) => {
                        const rad = parseInt(e.target.value);
                        setFormData({ ...formData, radius: rad });
                        if (circle.current) circle.current.setRadius(rad);
                      }}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${formData.geofenceEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                      onClick={() => setFormData({ ...formData, geofenceEnabled: !formData.geofenceEnabled })}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.geofenceEnabled ? 'left-7' : 'left-1'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">Geofence Attendance</p>
                      <p className="text-[10px] font-bold text-slate-400 tracking-tighter">Force employees to punch in only within radius</p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {editingLoc ? 'Update Place' : 'Create Place'}
                  </button>
                </form>

                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[11px] font-bold text-slate-400 tracking-widest">Select From Map</label>
                    <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                      <Navigation size={10} /> Click to place pin
                    </span>
                  </div>
                  <div className="flex-1 bg-slate-50 rounded-[2rem] border-2 border-slate-100 overflow-hidden relative min-h-[300px]">
                    <div ref={mapRef} className="w-full h-full" />
                    {!leafletLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                        <Loader2 className="animate-spin text-indigo-600" />
                      </div>
                    )}
                  </div>
                  <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex gap-3">
                    <CheckCircle2 className="text-indigo-600 shrink-0" size={20} />
                    <p className="text-[11px] font-medium text-indigo-700 leading-relaxed">
                      Drag the marker or click on the map to accurately position your office. The blue circle represents the allowed attendance zone.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {deleteConfirm.show && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Confirm Deletion</h3>
              <p className="text-sm font-medium text-slate-500 mb-6">
                Are you sure you want to delete this record? This action cannot be undone.
              </p>
              <div className="flex w-full gap-3">
                <button onClick={() => setDeleteConfirm({ show: false, id: null })} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all">
                  Cancel
                </button>
                <button onClick={() => { handleDelete(deleteConfirm.id); setDeleteConfirm({ show: false, id: null }); }} className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all">
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default WorkingPlaces;
