import { memo } from 'react';

const LEVEL_TAPE_THEMES = {
  1: { bg: 'bg-purple-100/70 border-purple-300/80', badge: 'bg-purple-600 text-white', text: 'text-purple-900' },
  2: { bg: 'bg-indigo-100/70 border-indigo-300/80', badge: 'bg-indigo-600 text-white', text: 'text-indigo-900' },
  3: { bg: 'bg-blue-100/70 border-blue-300/80', badge: 'bg-blue-600 text-white', text: 'text-blue-900' },
  4: { bg: 'bg-sky-100/70 border-sky-300/80', badge: 'bg-sky-600 text-white', text: 'text-sky-900' },
  5: { bg: 'bg-cyan-100/70 border-cyan-300/80', badge: 'bg-cyan-600 text-white', text: 'text-cyan-900' },
  6: { bg: 'bg-teal-100/70 border-teal-300/80', badge: 'bg-teal-600 text-white', text: 'text-teal-900' },
  7: { bg: 'bg-emerald-100/70 border-emerald-300/80', badge: 'bg-emerald-600 text-white', text: 'text-emerald-900' },
  8: { bg: 'bg-green-100/70 border-green-300/80', badge: 'bg-green-600 text-white', text: 'text-green-900' },
  9: { bg: 'bg-amber-100/70 border-amber-300/80', badge: 'bg-amber-600 text-white', text: 'text-amber-900' },
  10: { bg: 'bg-orange-100/70 border-orange-300/80', badge: 'bg-orange-600 text-white', text: 'text-orange-900' },
  11: { bg: 'bg-rose-100/70 border-rose-300/80', badge: 'bg-rose-600 text-white', text: 'text-rose-900' },
  12: { bg: 'bg-pink-100/70 border-pink-300/80', badge: 'bg-pink-600 text-white', text: 'text-pink-900' },
  default: { bg: 'bg-slate-100/70 border-slate-300/80', badge: 'bg-slate-700 text-white', text: 'text-slate-900' }
};

const LevelTapeNode = ({ data }) => {
  const { levelNumber, count, width = 200000, levelName, badgePaddingLeft = 99650 } = data;
  const theme = LEVEL_TAPE_THEMES[levelNumber] || LEVEL_TAPE_THEMES.default;
  const labelText = levelName ? `LEVEL ${levelNumber}: ${levelName}` : `LEVEL ${levelNumber}`;

  return (
    <div
      className={`border-y-2 ${theme.bg} backdrop-blur-xs flex items-center justify-start py-2.5 select-none shadow-xs pointer-events-none`}
      style={{ width, height: 170, marginTop: 20, paddingLeft: badgePaddingLeft, boxSizing: 'border-box' }}
    >
      {/* Left Level Label Badge & Count Badge */}
      <div className="flex items-center gap-3">
        <span className={`px-3.5 py-1.5 rounded-xl font-bold text-xs ${theme.badge} shadow-xs tracking-wider whitespace-nowrap`}>
          {labelText}
        </span>
        {count !== undefined && (
          <span className="px-3 py-1 rounded-xl bg-white/90 border border-slate-300 font-bold text-xs text-slate-800 shadow-2xs whitespace-nowrap">
            {count} {count === 1 ? 'Employee' : 'Employees'}
          </span>
        )}
      </div>
    </div>
  );
};

export default memo(LevelTapeNode);
