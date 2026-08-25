import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';
import { IMAGE_BASE_URL } from '../api/axios';
import { getDepartmentTheme } from '../utils/departmentColors';

const getFullImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${IMAGE_BASE_URL}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`;
};

const EmployeeNode = ({ data }) => {
  const {
    name,
    roleCode,
    department,
    designation,
    profileImage,
    levelName,
    role
  } = data;

  const titleText = designation || levelName || role || roleCode || 'Staff';
  const theme = getDepartmentTheme(department);

  return (
    <div className="w-[185px] select-none cursor-pointer flex flex-col items-center group relative">
      {/* Top Handle for Connection Lines */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-slate-700 !border-2 !border-white !z-30"
        style={{ top: -2 }}
      />

      {/* Main Circular Profile Image Section */}
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
              <img
                src={getFullImageUrl(profileImage)}
                alt={name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full rounded-full flex items-center justify-center font-bold text-xl"
                style={{ backgroundColor: theme.bgLight, color: theme.text }}
              >
                {(name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Active Status Dot */}
        <div className="absolute bottom-1 right-2 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white shadow-xs" />
      </div>

      {/* Compact Name Box */}
      <div
        className="bg-white border-2 rounded-lg shadow-xs overflow-hidden flex items-center justify-center transition-all group-hover:shadow-md"
        style={{
          width: 124,
          paddingTop: 8,
          paddingBottom: 3,
          minHeight: 22,
          borderColor: theme.border
        }}
      >
        <h4
          className="text-[14px] font-extrabold text-slate-900 leading-tight w-full text-center px-1"
          title={name}
        >
          {name || 'Employee'}
        </h4>
      </div>

      {/* Role Banner Pill with Department Primary Color */}
      <div
        className="text-white rounded-lg text-center font-bold text-[11px] leading-tight shadow-xs overflow-hidden"
        style={{
          width: 110,
          paddingTop: 2.5,
          paddingBottom: 2.5,
          paddingLeft: 4,
          paddingRight: 4,
          backgroundColor: theme.primary,
          marginTop: 1
        }}
      >
        <span className="truncate block" title={titleText}>
          {titleText}
        </span>
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
