/**
 * attendanceStatsService.js — COMPATIBILITY SHIM
 * ─────────────────────────────────────────────────────────────
 * All logic has been moved to employeeStatsService.js (Single Source of Truth).
 * This file re-exports the canonical functions so existing imports keep working.
 * Do NOT add new business logic here — use employeeStatsService.js instead.
 */
module.exports = require('./employeeStatsService');
