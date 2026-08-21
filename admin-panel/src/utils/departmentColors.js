/**
 * Unified Department Color System
 * Provides 18+ high-contrast, visually distinct, rich modern color palettes.
 * Every department receives a completely unique color on the color wheel.
 */

export const DEPARTMENT_PALETTES = [
  // 0: Purple - Executive / Management
  {
    key: 'purple',
    name: 'Executive Purple',
    primary: '#7c3aed',
    accent: '#9333ea',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #a855f7 100%)',
    border: '#7c3aed',
    bgLight: '#f5f3ff',
    badgeBg: '#7c3aed',
    badgeText: '#ffffff',
    text: '#6d28d9',
    ring: '#c4b5fd'
  },
  // 1: Royal Cobalt Blue - Software & Systems / Tech
  {
    key: 'blue',
    name: 'Cobalt Royal Blue',
    primary: '#2563eb',
    accent: '#3b82f6',
    gradient: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #60a5fa 100%)',
    border: '#2563eb',
    bgLight: '#eff6ff',
    badgeBg: '#2563eb',
    badgeText: '#ffffff',
    text: '#1d4ed8',
    ring: '#bfdbfe'
  },
  // 2: Crimson Rose / Red - Sales & Marketing
  {
    key: 'rose',
    name: 'Crimson Rose',
    primary: '#e11d48',
    accent: '#f43f5e',
    gradient: 'linear-gradient(135deg, #be123c 0%, #e11d48 50%, #fb7185 100%)',
    border: '#e11d48',
    bgLight: '#fff1f2',
    badgeBg: '#e11d48',
    badgeText: '#ffffff',
    text: '#be123c',
    ring: '#fecdd3'
  },
  // 3: Sunset Orange - Customer Support
  {
    key: 'orange',
    name: 'Sunset Orange',
    primary: '#ea580c',
    accent: '#f97316',
    gradient: 'linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #fb923c 100%)',
    border: '#ea580c',
    bgLight: '#fff7ed',
    badgeBg: '#ea580c',
    badgeText: '#ffffff',
    text: '#c2410c',
    ring: '#fed7aa'
  },
  // 4: Golden Amber - Accounts & Purchase / Finance
  {
    key: 'amber',
    name: 'Golden Amber',
    primary: '#d97706',
    accent: '#f59e0b',
    gradient: 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #fbbf24 100%)',
    border: '#d97706',
    bgLight: '#fffbeb',
    badgeBg: '#d97706',
    badgeText: '#ffffff',
    text: '#b45309',
    ring: '#fde68a'
  },
  // 5: Vivid Fuchsia Pink - HR & Admin
  {
    key: 'pink',
    name: 'Vivid Fuchsia Pink',
    primary: '#db2777',
    accent: '#ec4899',
    gradient: 'linear-gradient(135deg, #be185d 0%, #db2777 50%, #f472b6 100%)',
    border: '#db2777',
    bgLight: '#fdf2f8',
    badgeBg: '#db2777',
    badgeText: '#ffffff',
    text: '#be185d',
    ring: '#fbcfe8'
  },
  // 6: Neon Cyan / Sky - Electronics & Hardware
  {
    key: 'cyan',
    name: 'Neon Cyan',
    primary: '#0891b2',
    accent: '#06b6d4',
    gradient: 'linear-gradient(135deg, #0e7490 0%, #0891b2 50%, #22d3ee 100%)',
    border: '#0891b2',
    bgLight: '#ecfeff',
    badgeBg: '#0891b2',
    badgeText: '#ffffff',
    text: '#0e7490',
    ring: '#a5f3fc'
  },
  // 7: Electric Indigo - Projects & Engineering
  {
    key: 'indigo',
    name: 'Electric Indigo',
    primary: '#4f46e5',
    accent: '#6366f1',
    gradient: 'linear-gradient(135deg, #4338ca 0%, #4f46e5 50%, #818cf8 100%)',
    border: '#4f46e5',
    bgLight: '#eef2ff',
    badgeBg: '#4f46e5',
    badgeText: '#ffffff',
    text: '#4338ca',
    ring: '#c7d2fe'
  },
  // 8: Emerald Green - Operations & Logistics
  {
    key: 'emerald',
    name: 'Emerald Green',
    primary: '#059669',
    accent: '#10b981',
    gradient: 'linear-gradient(135deg, #047857 0%, #059669 50%, #10b981 100%)',
    border: '#059669',
    bgLight: '#ecfdf5',
    badgeBg: '#059669',
    badgeText: '#ffffff',
    text: '#047857',
    ring: '#a7f3d0'
  },
  // 9: Warm Bronze / Wood - Store & Inventory
  {
    key: 'bronze',
    name: 'Warm Bronze',
    primary: '#854d0e',
    accent: '#a16207',
    gradient: 'linear-gradient(135deg, #713f12 0%, #854d0e 50%, #ca8a04 100%)',
    border: '#854d0e',
    bgLight: '#fefce8',
    badgeBg: '#854d0e',
    badgeText: '#ffffff',
    text: '#713f12',
    ring: '#fef08a'
  },
  // 10: Deep Violet - Quality Assurance (QA)
  {
    key: 'violet',
    name: 'Deep Violet',
    primary: '#6d28d9',
    accent: '#7c3aed',
    gradient: 'linear-gradient(135deg, #5b21b6 0%, #6d28d9 50%, #8b5cf6 100%)',
    border: '#6d28d9',
    bgLight: '#ede9fe',
    badgeBg: '#6d28d9',
    badgeText: '#ffffff',
    text: '#5b21b6',
    ring: '#ddd6fe'
  },
  // 11: Slate Steel - Administration & Facilities
  {
    key: 'slate',
    name: 'Slate Steel',
    primary: '#475569',
    accent: '#64748b',
    gradient: 'linear-gradient(135deg, #334155 0%, #475569 50%, #94a3b8 100%)',
    border: '#475569',
    bgLight: '#f8fafc',
    badgeBg: '#475569',
    badgeText: '#ffffff',
    text: '#334155',
    ring: '#cbd5e1'
  },
  // 12: Bright Lime - Maintenance
  {
    key: 'lime',
    name: 'Bright Lime',
    primary: '#65a30d',
    accent: '#84cc16',
    gradient: 'linear-gradient(135deg, #4d7c0f 0%, #65a30d 50%, #a3e635 100%)',
    border: '#65a30d',
    bgLight: '#f7fee7',
    badgeBg: '#65a30d',
    badgeText: '#ffffff',
    text: '#4d7c0f',
    ring: '#d9f99d'
  },
  // 13: Ruby Scarlet - Marketing
  {
    key: 'ruby',
    name: 'Ruby Scarlet',
    primary: '#dc2626',
    accent: '#ef4444',
    gradient: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 50%, #f87171 100%)',
    border: '#dc2626',
    bgLight: '#fef2f2',
    badgeBg: '#dc2626',
    badgeText: '#ffffff',
    text: '#b91c1c',
    ring: '#fecaca'
  },
  // 14: Deep Teal - Legal & Compliance
  {
    key: 'teal',
    name: 'Deep Teal',
    primary: '#0d9488',
    accent: '#14b8a6',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #2dd4bf 100%)',
    border: '#0d9488',
    bgLight: '#f0fdfa',
    badgeBg: '#0d9488',
    badgeText: '#ffffff',
    text: '#0f766e',
    ring: '#99f6e4'
  },
  // 15: Ocean Blue - Consulting & Services
  {
    key: 'sky',
    name: 'Ocean Blue',
    primary: '#0284c7',
    accent: '#0ea5e9',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0284c7 50%, #38bdf8 100%)',
    border: '#0284c7',
    bgLight: '#f0f9ff',
    badgeBg: '#0284c7',
    badgeText: '#ffffff',
    text: '#0369a1',
    ring: '#bae6fd'
  },
  // 16: Vibrant Orchid - Training & Security
  {
    key: 'fuchsia',
    name: 'Vibrant Orchid',
    primary: '#c026d3',
    accent: '#d946ef',
    gradient: 'linear-gradient(135deg, #a21caf 0%, #c026d3 50%, #e879f9 100%)',
    border: '#c026d3',
    bgLight: '#fdf4ff',
    badgeBg: '#c026d3',
    badgeText: '#ffffff',
    text: '#a21caf',
    ring: '#f5d0fe'
  },
  // 17: Golden Honey - Research & Development
  {
    key: 'yellow',
    name: 'Golden Honey',
    primary: '#ca8a04',
    accent: '#eab308',
    gradient: 'linear-gradient(135deg, #a16207 0%, #ca8a04 50%, #fde047 100%)',
    border: '#ca8a04',
    bgLight: '#fefce8',
    badgeBg: '#ca8a04',
    badgeText: '#ffffff',
    text: '#a16207',
    ring: '#fef08a'
  }
];

// Direct semantic mapping for distinct, high-contrast visual department identity
const DIRECT_MAPPINGS = {
  // 🟣 0: Executive / Management (Purple)
  'executive': 0,
  'management': 0,
  'director': 0,
  'board': 0,

  // 🔵 1: Software & Systems / IT (Royal Cobalt Blue)
  'software and systems': 1,
  'software & systems': 1,
  'software': 1,
  'software engineering': 1,
  'it': 1,
  'tech': 1,
  'technology': 1,

  // 🔴 2: Sales & Marketing (Crimson Rose / Red)
  'sales and marketing': 2,
  'sales & marketing': 2,
  'sales': 2,
  'business development': 2,
  'bd': 2,

  // 🟠 3: Customer Support (Sunset Orange)
  'customer support': 3,
  'customer support & service': 3,
  'customer service': 3,
  'customer relations': 3,
  'support': 3,
  'helpdesk': 3,

  // 🟡 4: Accounts & Purchase / Finance (Golden Amber)
  'accounts and purchase': 4,
  'accounts & purchase': 4,
  'accounts': 4,
  'purchase': 4,
  'finance': 4,
  'accounting': 4,
  'billing': 4,

  // 🩷 5: HR & Admin (Vivid Fuchsia Pink)
  'hr and admin': 5,
  'hr & admin': 5,
  'human resource': 5,
  'human resources': 5,
  'hr': 5,
  'people': 5,

  // 🩵 6: Electronics & Hardware (Neon Cyan)
  'electronics': 6,
  'electronics and hardware': 6,
  'electronics & hardware': 6,
  'hardware': 6,
  'embedded': 6,
  'iot': 6,

  // 🫐 7: Projects & Engineering (Electric Indigo)
  'projects and engineering': 7,
  'projects & engineering': 7,
  'engineering': 7,
  'projects': 7,
  'project management': 7,

  // 🟢 8: Operations & Logistics (Emerald Green)
  'operations': 8,
  'operations and logistics': 8,
  'operations & logistics': 8,
  'logistics': 8,
  'supply chain': 8,

  // 🟤 9: Store & Inventory (Warm Bronze)
  'store': 9,
  'stores': 9,
  'inventory': 9,
  'warehouse': 9,

  // 🟣 10: Quality Assurance (Deep Violet)
  'quality assurance': 10,
  'qa': 10,
  'testing': 10,
  'qc': 10,

  // 🔘 11: Administration & Facilities (Slate Steel)
  'admin': 11,
  'administration': 11,
  'facilities': 11,

  // 🟩 12: Maintenance (Bright Lime)
  'maintenance': 12,

  // 🔴 13: Marketing (Ruby Scarlet)
  'marketing': 13,
  'digital marketing': 13,

  // 🩵 14: Legal & Compliance (Deep Teal)
  'legal': 14,
  'compliance': 14,

  // 🔵 15: Consulting & Services (Ocean Blue)
  'consulting': 15,
  'services': 15,

  // 🟪 16: Training & Security (Vibrant Orchid)
  'training': 16,
  'security': 16,

  // 💛 17: Research & Development (Golden Honey)
  'research': 17,
  'r&d': 17
};

/**
 * Returns a robust color palette for any department name.
 * Uses direct domain mapping or deterministic string hashing for dynamic departments.
 */
export const getDepartmentTheme = (department) => {
  if (!department) return DEPARTMENT_PALETTES[0];
  const cleaned = department.toLowerCase().trim();

  if (DIRECT_MAPPINGS[cleaned] !== undefined) {
    return DEPARTMENT_PALETTES[DIRECT_MAPPINGS[cleaned] % DEPARTMENT_PALETTES.length];
  }

  // Hash unknown / dynamic departments deterministically
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    hash = (hash << 5) - hash + cleaned.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % DEPARTMENT_PALETTES.length;
  return DEPARTMENT_PALETTES[idx];
};

export default {
  DEPARTMENT_PALETTES,
  getDepartmentTheme
};
