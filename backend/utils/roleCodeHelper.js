/**
 * Role Code Helper Utility
 * 
 * Generates and parses role codes following the convention:
 * {OrgCode}{DeptPrefix}{Level}{Grade}
 * 
 * Example: TCSF1a = TruCode + Software + Level 1 (Manager) + Grade a (Entry)
 * 
 * Global master roles:
 * - TCSA1 = Super Admin
 * - TCCA1 = Company Admin  
 * - TCGA1 = Auditor / Guest
 */

/**
 * Generate a role code from its components
 * @param {string} orgCode - Organization code (e.g., 'TC')
 * @param {string} deptPrefix - Department prefix (e.g., 'SF')
 * @param {number|string} level - Role level (e.g., 1)
 * @param {string} grade - Role grade (e.g., 'a')
 * @returns {string} Role code (e.g., 'TCSF1a')
 */
function generateRoleCode(orgCode, deptPrefix, level, grade) {
  if (!orgCode || !deptPrefix || !level || !grade) {
    return null;
  }
  return `${orgCode.toUpperCase()}${deptPrefix.toUpperCase()}${level}${grade.toLowerCase()}`;
}

/**
 * Parse a role code into its components
 * @param {string} roleCode - e.g., 'TCSF1a'
 * @param {number} orgCodeLength - Length of the org code prefix (default 2)
 * @returns {{ orgCode: string, deptPrefix: string, level: number, grade: string } | null}
 */
function parseRoleCode(roleCode, orgCodeLength = 2) {
  if (!roleCode || roleCode.length < orgCodeLength + 4) {
    return null;
  }

  const orgCode = roleCode.substring(0, orgCodeLength);
  const deptPrefix = roleCode.substring(orgCodeLength, orgCodeLength + 2);
  const remaining = roleCode.substring(orgCodeLength + 2);

  // Extract level (digits) and grade (letters) from remaining
  const match = remaining.match(/^(\d+)([a-zA-Z]+)$/);
  if (!match) {
    return null;
  }

  return {
    orgCode,
    deptPrefix,
    level: parseInt(match[1], 10),
    grade: match[2].toLowerCase(),
  };
}

/**
 * Global master role codes
 */
const GLOBAL_ROLES = {
  SUPER_ADMIN: { suffix: 'SA1', role: 'super_admin', name: 'Super Admin' },
  COMPANY_ADMIN: { suffix: 'CA1', role: 'company_admin', name: 'Company Admin' },
  AUDITOR: { suffix: 'GA1', role: 'auditor', name: 'Auditor / Guest' },
};

/**
 * Generate global master role code
 * @param {string} orgCode - Organization code
 * @param {string} globalRoleKey - One of 'SUPER_ADMIN', 'COMPANY_ADMIN', 'AUDITOR'
 * @returns {string} e.g., 'TCSA1'
 */
function generateGlobalRoleCode(orgCode, globalRoleKey) {
  const globalRole = GLOBAL_ROLES[globalRoleKey];
  if (!globalRole) return null;
  return `${orgCode.toUpperCase()}${globalRole.suffix}`;
}

/**
 * Check if a user's level grants authority over a target level
 * Lower level number = more authority (Level 1 > Level 2 > Level 3...)
 * @param {number} userLevel - The user's role level
 * @param {number} targetLevel - The minimum level required
 * @returns {boolean}
 */
function hasLevelAuthority(userLevel, targetLevel) {
  if (!userLevel || !targetLevel) return false;
  return userLevel <= targetLevel;
}

module.exports = {
  generateRoleCode,
  parseRoleCode,
  GLOBAL_ROLES,
  generateGlobalRoleCode,
  hasLevelAuthority,
};
