import { useSelector } from 'react-redux';

export const useActiveRole = () => {
  const userFromRedux = useSelector((state) => state.auth?.user);
  let user = userFromRedux;

  if (!user) {
    try {
      const stored = localStorage.getItem('user');
      if (stored && stored !== 'undefined') {
        user = JSON.parse(stored);
      }
    } catch (_) {}
  }
  
  const role = user?.role || 'super_admin';
  const adminType = user?.departmentAdminType || null;
  let label = 'Super Admin';
  
  if (role === 'super_admin') label = 'Super Admin';
  else if (role === 'team_lead') label = 'Team Lead';
  else if (role === 'department_admin') {
    if (adminType === 'store') label = 'Store Admin';
    else if (adminType === 'accounts') label = 'Accounts Admin';
    else if (adminType === 'management') label = 'Management Admin';
    else label = 'Dept Admin';
  }

  return { role, adminType, label };
};

export default useActiveRole;
