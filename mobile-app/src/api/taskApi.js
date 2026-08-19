import api from './axios';

export const taskApi = {
  // Fetch calendar events and holidays for a given month and year
  getCalendarTasks: async (year, month) => {
    const res = await api.get('/tasks/calendar', {
      params: { year, month },
    });
    return res.data?.data || { events: [], holidays: [], holidayDetails: [], summary: {} };
  },

  // Fetch list of tasks with optional query filters
  getMyTasks: async (params = {}) => {
    const res = await api.get('/tasks', { params });
    return res.data?.data || [];
  },

  // Create a new task (pending or in_progress)
  createTask: async (taskData) => {
    const res = await api.post('/tasks', taskData);
    return res.data?.data;
  },

  // Update a task completely
  updateTask: async (taskId, taskData) => {
    const res = await api.put(`/tasks/${taskId}`, taskData);
    return res.data?.data;
  },

  // Quick toggle / update status ('pending', 'in_progress', 'completed')
  updateTaskStatus: async (taskId, status) => {
    const res = await api.patch(`/tasks/${taskId}/status`, { status });
    return res.data?.data;
  },

  // Delete a task
  deleteTask: async (taskId) => {
    const res = await api.delete(`/tasks/${taskId}`);
    return res.data;
  },
};

export default taskApi;
