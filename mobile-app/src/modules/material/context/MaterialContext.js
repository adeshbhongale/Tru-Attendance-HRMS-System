import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import materialApi from '../api/materialApi';

const MaterialContext = createContext();

export const MaterialProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [metrics, setMetrics] = useState({
    activeTransactions: 0,
    barcodesInCustody: 0,
    pendingApprovals: 0,
    dispatchedCount: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const uStr = await AsyncStorage.getItem('user');
      if (uStr) {
        setUser(JSON.parse(uStr));
      }
    } catch (e) {
      console.warn('Failed loading user in MaterialContext', e);
    }
  };

  const refreshMetrics = async () => {
    try {
      setLoading(true);
      const res = await materialApi.getDashboardMetrics();
      if (res && res.success) {
        setMetrics(res.data || res.metrics || metrics);
      }
    } catch (err) {
      console.warn('Failed fetching material metrics', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MaterialContext.Provider
      value={{
        user,
        metrics,
        loading,
        refreshMetrics,
      }}
    >
      {children}
    </MaterialContext.Provider>
  );
};

export const useMaterial = () => useContext(MaterialContext);
export default MaterialContext;
