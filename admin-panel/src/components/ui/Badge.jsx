import React from 'react';

const Badge = ({
  children,
  variant = 'default',
  className = '',
  ...props
}) => {
  const styles = {
    default: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    primary: 'bg-blue-50 text-blue-700 border-blue-200',
    secondary: 'bg-purple-50 text-purple-700 border-purple-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const getStatusVariant = (status) => {
    if (!status) return 'neutral';
    const strVal = typeof status === 'string' ? status : (Array.isArray(status) ? status.join(' ') : (typeof status === 'object' ? (status.name || status.status || status.label || 'default') : String(status)));
    const lower = typeof strVal === 'string' ? strVal.toLowerCase() : '';
    
    if (['accepted', 'completed', 'active', 'success'].includes(lower)) return 'success';
    if (['pending', 'warning', 'resubmitted'].includes(lower)) return 'warning';
    if (['rejected', 'disabled', 'danger'].includes(lower)) return 'danger';
    if (['draft', 'inactive'].includes(lower)) return 'neutral';
    if (['info', 'assigned'].includes(lower)) return 'info';
    return 'default';
  };

  const activeVariant = styles[variant] || styles[getStatusVariant(children)];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${activeVariant} ${className}`}
      {...props}
    >
      {typeof children === 'object' && children !== null && !React.isValidElement(children) && !Array.isArray(children)
        ? (children.name || children.label || children.fullName || children.status || children.employeeId || children.email || 'Badge')
        : children}
    </span>
  );
};

export default Badge;
