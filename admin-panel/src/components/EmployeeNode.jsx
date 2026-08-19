import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

const EmployeeNode = ({ data }) => {
  const {
    name, roleCode,
    headerBg, profileImage, levelName, role
  } = data;

  const titleText = levelName || role || roleCode;

  // Map department headerBg class to theme colors + gradient for circle
  const getTheme = (bgClass) => {
    if (bgClass?.includes('purple')) {
      return {
        border: 'border-purple-600',
        banner: 'bg-purple-600',
        text: 'text-purple-600',
        gradient: 'linear-gradient(135deg, #9333ea, #6d28d9, #7c3aed)'
      };
    }
    if (bgClass?.includes('orange') || bgClass?.includes('amber')) {
      return {
        border: 'border-amber-500',
        banner: 'bg-amber-500',
        text: 'text-amber-600',
        gradient: 'linear-gradient(135deg, #f59e0b, #d97706, #fbbf24)'
      };
    }
    if (bgClass?.includes('sky') || bgClass?.includes('blue')) {
      return {
        border: 'border-blue-600',
        banner: 'bg-blue-600',
        text: 'text-blue-600',
        gradient: 'linear-gradient(135deg, #2563eb, #0284c7, #3b82f6)'
      };
    }
    if (bgClass?.includes('teal') || bgClass?.includes('emerald')) {
      return {
        border: 'border-teal-500',
        banner: 'bg-teal-500',
        text: 'text-teal-600',
        gradient: 'linear-gradient(135deg, #0d9488, #0f766e, #14b8a6)'
      };
    }
    if (bgClass?.includes('rose') || bgClass?.includes('red')) {
      return {
        border: 'border-rose-500',
        banner: 'bg-rose-500',
        text: 'text-rose-600',
        gradient: 'linear-gradient(135deg, #e11d48, #f43f5e, #fb7185)'
      };
    }
    return {
      border: 'border-indigo-600',
      banner: 'bg-indigo-600',
      text: 'text-indigo-600',
      gradient: 'linear-gradient(135deg, #4f46e5, #6366f1, #818cf8)'
    };
  };

  const theme = getTheme(headerBg);

  return (
    <div className="w-[185px] select-none cursor-pointer flex flex-col items-center group relative">
      {/* Top Handle for Connection Lines */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-slate-700 !border-2 !border-white !z-30"
        style={{ top: -2 }}
      />

      {/* 76×76px Circle Photo with Gradient Ring */}
      <div className="relative z-10" style={{ marginBottom: '-6px' }}>
        <div
          className="rounded-full shadow-md flex items-center justify-center"
          style={{
            width: 96,
            height: 96,
            background: theme.gradient,
            padding: 5
          }}
        >
          <div className="w-full h-full rounded-full bg-white p-[2px] flex items-center justify-center overflow-hidden">
            {profileImage ? (
              <img src={profileImage} alt={name} className="w-full h-full rounded-full object-cover" />
            ) : (
              <div className={`w-full h-full rounded-full bg-slate-50 ${theme.text} font-bold text-xl flex items-center justify-center`}>
                {(name || 'U').charAt(0)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compact Name Box */}
      <div
        className={`bg-white border-2 rounded-lg ${theme.border} shadow-xs overflow-hidden flex items-center justify-center`}
        style={{ width: 120, paddingTop: 8, paddingBottom: 3, minHeight: 20 }}
      >
        <h4 className="text-[15px] font-bold text-slate-900 leading-tight w-full text-center px-1">
          {name || 'Employee'}
        </h4>
      </div>

      {/* Even Smaller Role Banner */}
      <div
        className={`${theme.banner} text-white rounded-lg text-center font-bold text-[12px] leading-tight shadow-xs overflow-hidden`}
        style={{ width: 105, paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4 }}
      >
        {titleText}
      </div>

      {/* Bottom Handle for Connection Lines */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-slate-700 !border-2 !border-white !z-30"
        style={{ bottom: -2 }}
      />
    </div>
  );
};

export default memo(EmployeeNode);
