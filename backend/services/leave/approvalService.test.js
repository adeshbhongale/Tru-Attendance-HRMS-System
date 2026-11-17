// Run: node --test services/leave/approvalService.test.js
const test = require('node:test');
const assert = require('node:assert');
const User = require('../../models/User');
const approval = require('./approvalService');

const MGR = 'a'.repeat(24), EMP = 'b'.repeat(24), HR = 'c'.repeat(24);
User.findById = () => ({ select: () => ({ lean: async () => ({ reportsTo: MGR }) }) });
const leave = { user: { toString: () => EMP } };
const hrAdmin = { _id: HR, role: 'hr_admin' };

test('mobile (directOnly): only the direct reporting manager may act', async () => {
  await approval.assertApprover(leave, { _id: MGR }, { directOnly: true });
  await assert.rejects(approval.assertApprover(leave, hrAdmin, { directOnly: true }), /direct reporting manager/);
});

test('admin website path keeps privileged HR/Company admin access', async () => {
  await approval.assertApprover(leave, hrAdmin);
});
