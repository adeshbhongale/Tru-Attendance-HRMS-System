import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';

const EXPENSE_TYPE_LABELS = {
  FOOD: 'Food / Daily Allowance',
  TRAVEL: 'Travel',
  CONVEYANCE: 'Local Conveyance',
  LODGING: 'Lodging & Stay',
  LOGGING: 'Lodging & Stay',
  OTHER: 'Other Expense',
  OTHER_EXPENSE: 'Other Expense',
  STOCK_PURCHASE: 'Stock Purchase',
  COMBINE: 'Combined Expense',
  COMBINED: 'Combined Expense',
};

const VEHICLE_LABELS = {
  twoWheeler: '2-Wheeler (Bike / Scooter)',
  TWO_WHEELER: '2-Wheeler (Bike / Scooter)',
  fourWheeler: '4-Wheeler (Car / Cab)',
  FOUR_WHEELER: '4-Wheeler (Car / Cab)',
  publicTransport: 'Public Transport',
  PUBLIC_TRANSPORT: 'Public Transport',
};

const fmtINR = (val) => {
  const n = Number(val);
  if (!Number.isFinite(n)) return '₹0';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

const formatDate = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const resolveProofUrl = (f) => {
  if (!f) return '';
  if (typeof f === 'string') return f;
  return f.url || f.secure_url || f.fileUrl || f.path || f.uri || '';
};

const cleanExplanationText = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/Rule\s+[A-Z0-9_-]+\s*(\([^)]*\))?\s*:\s*/gi, '')
    .replace(/\[Rule:[^\]]*\]/gi, '')
    .trim();
};

const parsePolicyExplanation = (text) => {
  const cleaned = cleanExplanationText(text);
  if (!cleaned) return { raw: '', individualLimits: [], combinedRule: '', outcome: '', extraNotes: [] };

  const lines = cleaned
    .split(/\n|(?=•)|(?=Individual limits per day:)|(?=Stay budget rule)|(?=Combined Whole Claim Limit:)|(?=Claimed bill:)|(?=Since your)|(?=Therefore,)/i)
    .map((l) => l.trim())
    .filter(Boolean);

  const individualLimits = [];
  let combinedRule = '';
  let outcome = '';
  const extraNotes = [];

  lines.forEach((line) => {
    const cleanLine = line.replace(/^[•\-*]\s*/, '').trim();
    if (!cleanLine || /^individual limits per day:?$/i.test(cleanLine)) return;

    if (
      line.startsWith('•') ||
      (/^[A-Za-z\s.]+:\s*(₹|Rs\.?)\s*[\d,]+(\.\d+)?\s*\/\s*(day|night)/i.test(cleanLine) &&
        !/^(combined|stay|claimed|policy|allowed|excess)/i.test(cleanLine))
    ) {
      individualLimits.push(cleanLine);
    } else if (/^(stay budget rule|combined whole claim limit|combined limit|daily limit)/i.test(cleanLine)) {
      combinedRule = combinedRule ? `${combinedRule} • ${cleanLine}` : cleanLine;
    } else if (/^(claimed bill|since your|therefore,|your claimed|bill exceeds|within your)/i.test(cleanLine)) {
      outcome = outcome ? `${outcome} ${cleanLine}` : cleanLine;
    } else {
      extraNotes.push(cleanLine);
    }
  });

  return { raw: cleaned, individualLimits, combinedRule, outcome, extraNotes };
};

function ProofGrid({ items, accent = 'slate' }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const borderClass =
    accent === 'purple'
      ? 'border-purple-200 bg-white hover:border-purple-400'
      : accent === 'emerald'
        ? 'border-emerald-200 bg-white hover:border-emerald-400'
        : 'border-slate-200 bg-slate-50 hover:border-indigo-400';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
      {items.map((r, i) => {
        const url = resolveProofUrl(r);
        const name = (typeof r === 'object' && (r.name || r.fileName || r.originalName)) || `Attachment #${i + 1}`;
        const sizeKb = typeof r === 'object' && r.size ? `${(Number(r.size) / 1024).toFixed(1)} KB` : '';
        return (
          <a
            key={i}
            href={url || '#'}
            target={url ? '_blank' : undefined}
            rel="noreferrer"
            onClick={(e) => {
              if (!url) e.preventDefault();
            }}
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors ${borderClass}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
                {sizeKb ? <p className="text-[10px] text-slate-500">{sizeKb}</p> : null}
              </div>
            </div>
            {url ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 shrink-0">
                View <ExternalLink className="w-3 h-3" />
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 shrink-0">No URL</span>
            )}
          </a>
        );
      })}
    </div>
  );
}

function DetailRow({ label, value, valueClass = 'text-slate-900 font-semibold' }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-100 last:border-b-0 text-xs">
      <span className="text-slate-500 font-medium shrink-0">{label}</span>
      <span className={`text-right break-words ${valueClass}`}>{value ?? '—'}</span>
    </div>
  );
}

export default function ExpenseClaimDetailContent({ claim }) {
  const [collapsedCategories, setCollapsedCategories] = useState({});
  if (!claim) return null;

  const isLodging =
    String(claim.claimMode || '').toUpperCase() === 'LODGING' ||
    String(claim.claimMode || '').toUpperCase() === 'LOGGING' ||
    String(claim.claimType || '').toUpperCase() === 'LODGING';

  // Employee list & slots (matching Mobile App Section 2)
  const employeeClaims = Array.isArray(claim.employeeClaims) ? claim.employeeClaims : [];
  const rawEmployees = employeeClaims.map((ec) => {
    const emp = ec?.employee || {};
    const pop = emp?.employeeId && typeof emp.employeeId === 'object' ? emp.employeeId : {};
    return {
      _id: String(pop._id || emp.employeeId || emp._id || ''),
      name: emp.name || pop.name || 'Employee',
      employeeIdCode: emp.employeeIdCode || pop.employeeIdCode || '',
      department: emp.department || pop.department || '',
      designation: emp.designation || pop.designation || '',
      levelName: emp.levelName || pop.levelName || '',
    };
  });

  if (rawEmployees.length === 0 && claim.submittedBy) {
    const sub = typeof claim.submittedBy === 'object' ? claim.submittedBy : {};
    rawEmployees.push({
      _id: String(sub._id || claim.submittedBy || ''),
      name: sub.name || claim.submittedByName || 'Employee',
      employeeIdCode: sub.employeeIdCode || '',
      department: sub.department || '',
      designation: sub.designation || '',
      levelName: sub.levelName || '',
    });
  }

  const numEmployees = Math.max(Number(claim.numberOfEmployees) || 0, rawEmployees.length, 1);
  const employeeSlots = Array.from({ length: numEmployees }, (_, i) => {
    return (
      rawEmployees[i] || {
        _id: `slot-${i}`,
        name: i === 0 ? claim.submittedByName || 'Primary Employee' : `Employee #${i + 1}`,
        employeeIdCode: '',
        department: '',
        designation: '',
        levelName: '',
      }
    );
  });

  // Dates & Stay info (Section 1)
  const fromDate = claim.fromDate || claim.trip?.fromDate;
  const toDate = claim.toDate || claim.trip?.toDate;
  const claimDate = claim.claimDate || claim.trip?.fromDate || claim.createdAt;
  const stayType = claim.stayType || 'HOTEL';

  let lodgingNights = Number(claim.numberOfNights) || 0;
  if (!lodgingNights && fromDate && toDate) {
    const d1 = new Date(fromDate);
    const d2 = new Date(toDate);
    if (!Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime())) {
      lodgingNights = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    }
  }
  const foodDays = Number(claim.numberOfFoodDays) || (lodgingNights > 0 ? lodgingNights + 1 : 1);

  // Visit Option (Section 3)
  const hasVisitInEntries =
    Array.isArray(claim.entries) &&
    claim.entries.some((e) => e && (String(e.visitType || '').toUpperCase() === 'VISIT' || e.isVisit === true));
  const hasVisitInItems =
    Array.isArray(claim.employeeClaims) &&
    claim.employeeClaims.some(
      (ec) =>
        Array.isArray(ec?.items) &&
        ec.items.some((it) => it && (String(it.visitType || '').toUpperCase() === 'VISIT' || it.isVisit === true))
    );
  const serviceReportsList = Array.isArray(claim.serviceReports) ? claim.serviceReports : [];
  const isVisitClaim =
    String(claim.visitType || '').toUpperCase() === 'VISIT' ||
    claim.isVisit === true ||
    hasVisitInEntries ||
    hasVisitInItems ||
    (!isLodging && serviceReportsList.length > 0 && String(claim.visitType || '').toUpperCase() !== 'NO_VISIT');

  // Entries & Shared Food Summary (Section 4)
  const rawEntries = Array.isArray(claim.entries) && claim.entries.length > 0 ? claim.entries : [];
  const ecItems0 = Array.isArray(employeeClaims[0]?.items) ? employeeClaims[0].items : [];

  const combinedEntries = (rawEntries.length > 0 ? rawEntries : ecItems0).map((entry, idx) => {
    const numEmps = Math.max(employeeClaims.length, 1);
    let sumReq = 0;
    let sumAllow = 0;
    let sumExc = 0;
    let sumLim = 0;
    let hasEcItem = false;

    employeeClaims.forEach((ec) => {
      const it = Array.isArray(ec?.items) ? ec.items[idx] : null;
      if (it) {
        hasEcItem = true;
        sumReq += Number(it.requestedAmount) || 0;
        sumAllow += Number(it.allowedAmount ?? it.requestedAmount) || 0;
        sumExc += Number(it.excessAmount) || 0;
        sumLim += Number(it.policyLimit ?? it.perDayLimit ?? it.allowedAmount ?? 0) || 0;
      }
    });

    const reqAmt = Number(entry.requestedAmount) || sumReq || 0;
    const allowAmt =
      entry.allowedAmount !== undefined
        ? Number(entry.allowedAmount)
        : hasEcItem
          ? sumAllow
          : reqAmt;
    const excAmt =
      entry.excessAmount !== undefined
        ? Number(entry.excessAmount)
        : hasEcItem
          ? sumExc
          : Math.max(0, reqAmt - allowAmt);
    const polLim =
      entry.policyLimit !== undefined
        ? Number(entry.policyLimit)
        : hasEcItem && sumLim > 0
          ? sumLim
          : allowAmt;

    const item0 = ecItems0[idx] || {};
    return {
      ...item0,
      ...entry,
      requestedAmount: reqAmt,
      allowedAmount: allowAmt,
      excessAmount: excAmt,
      policyLimit: polLim,
      numEmps,
    };
  });

  // Shared Food Allowance summary for Lodging claims
  const rawFoodEntries = Array.isArray(claim.foodEntries) ? claim.foodEntries : [];
  let foodSummary = null;
  if (isLodging && (claim.includeFood || rawFoodEntries.length > 0)) {
    const fReq =
      Number(claim.foodRequestedAmount) ||
      rawFoodEntries.reduce((s, f) => s + (Number(f.requestedAmount) || 0), 0);
    const fAllow =
      claim.foodAllowedAmount !== undefined
        ? Number(claim.foodAllowedAmount)
        : rawFoodEntries.reduce((s, f) => s + (Number(f.allowedAmount ?? f.requestedAmount) || 0), 0);
    const fExc =
      claim.foodExcessAmount !== undefined
        ? Number(claim.foodExcessAmount)
        : Math.max(0, fReq - fAllow);
    const fLim = Number(claim.foodPolicyLimit) || fAllow;
    if (fReq > 0 || fAllow > 0 || rawFoodEntries.length > 0) {
      foodSummary = {
        requestedAmount: fReq,
        allowedAmount: fAllow,
        excessAmount: fExc,
        policyLimit: fLim,
        fromDate: claim.foodFromDate || fromDate,
        toDate: claim.foodToDate || toDate,
        days: foodDays,
        remark: claim.foodRemark || rawFoodEntries[0]?.remark || rawFoodEntries[0]?.description || '',
        receipts: claim.foodReceipts || rawFoodEntries.flatMap((f) => f.receipts || []),
        plainExplanation: claim.foodPlainExplanation || '',
        dailyBreakdown: Array.isArray(claim.foodDailyBreakdown) ? claim.foodDailyBreakdown : [],
      };
    }
  }

  // Grand Totals (Section 6)
  const requested = Number(claim.requestedAmount ?? claim.grandRequested ?? claim.amount ?? 0);
  const allowed = Number(claim.allowedAmount ?? claim.grandAllowed ?? requested);
  const excess = Number(claim.excessAmount ?? claim.grandExcess ?? Math.max(0, requested - allowed));
  const policyLimit = Number(claim.grandPolicyLimit ?? claim.policyLimit ?? allowed);

  const fp = claim.fullPayment || {};
  const isFullPayment = Boolean(
    claim.requestFullPayment ||
    fp.requested ||
    claim.fullPaymentApproved ||
    (fp.status && fp.status !== 'NOT_REQUESTED')
  );
  const fullPaymentProofs = Array.isArray(fp.proofs)
    ? fp.proofs
    : Array.isArray(claim.fullPaymentProofs)
      ? claim.fullPaymentProofs
      : [];

  // Management check (strictly on claimant / submittedBy)
  const subObj = typeof claim.submittedBy === 'object' && claim.submittedBy !== null ? claim.submittedBy : {};
  const subRole = String(subObj.role || subObj.roleCode || '').trim().toUpperCase();
  const subDept = String(subObj.department || '').trim().toUpperCase();
  const subDesig = String(subObj.designation || '').trim().toUpperCase();
  const subResp = Array.isArray(subObj.responsibilityCodes)
    ? subObj.responsibilityCodes.map((c) => String(c || '').toUpperCase())
    : [];
  const isClaimantManagement = Boolean(
    subRole === 'MANAGEMENT' ||
    subDept === 'MANAGEMENT' ||
    subResp.includes('MANAGEMENT') ||
    /\b(DIRECTOR|CEO|CFO|MD|MANAGING DIRECTOR|PROMOTER|PROPRIETOR|PARTNER|PRESIDENT|VICE PRESIDENT)\b/.test(subDesig)
  );

  const mgr = claim.managerApproval || {};
  const fin = claim.financeApproval || {};
  const acc = claim.accountsApproval || {};
  const rej = claim.rejection || {};
  const disb = claim.disbursement || {};
  const statusUpper = String(claim.status || 'SUBMITTED').toUpperCase();
  const isPaid =
    ['PAID', 'DISBURSED', 'SETTLED'].includes(statusUpper) ||
    String(claim.paymentStatus || '').toUpperCase() === 'PAID';
  const isRejected = statusUpper === 'REJECTED';

  const normalizeTypeCode = (v) => {
    const c = String(v || '').trim().toUpperCase();
    if (!c) return '';
    if (c === 'PETROL' || c === 'LOCAL_CONVEYANCE' || c === 'LOCAL_TRAVEL') return 'CONVEYANCE';
    if (c === 'STAY' || c === 'HOTEL' || c === 'ACCOMMODATION') return 'LODGING';
    if (c === 'MEAL' || c === 'DA' || c === 'DAILY_ALLOWANCE') return 'FOOD';
    if (c === 'STOCK' || c === 'PURCHASE') return 'STOCK_PURCHASE';
    if (c === 'MISC' || c === 'MISCELLANEOUS' || c === 'OTHER_EXPENSE') return 'OTHER';
    return c;
  };
  const rawClaimType = normalizeTypeCode(
    claim.claimType || claim.expenseType || combinedEntries[0]?.expenseType || 'OTHER'
  );
  const claimTypeCodes = Array.from(
    new Set(
      [
        normalizeTypeCode(claim.claimType),
        normalizeTypeCode(claim.expenseType),
        ...combinedEntries.map((e) =>
          String(e?.otherSubType || '').toUpperCase() === 'PURCHASE'
            ? 'STOCK_PURCHASE'
            : normalizeTypeCode(e?.expenseType)
        ),
      ].filter(Boolean)
    )
  );
  const snapCfoCfg = claim.policySnapshot?.cfoApprovalConfig;
  const cfoCfgEnabled = snapCfoCfg ? snapCfoCfg.enabled !== false : true;
  const cfoCfgFullPayment = snapCfoCfg ? snapCfoCfg.applyOnFullPayment !== false : true;
  const cfoCfgTypes = Array.isArray(snapCfoCfg?.applicableClaimTypes)
    ? snapCfoCfg.applicableClaimTypes.map(normalizeTypeCode).filter(Boolean)
    : ['STOCK_PURCHASE'];
  const isCfoApplicableByRule = Boolean(
    cfoCfgEnabled &&
    ((isFullPayment && cfoCfgFullPayment) ||
      claimTypeCodes.some((code) => cfoCfgTypes.includes(code)))
  );

  const isOtherCode = (v) => ['OTHER', 'OTHER_EXPENSE', 'STOCK_PURCHASE'].includes(String(v || '').trim().toUpperCase());
  const isOtherSub = (v) => ['NORMAL', 'PURCHASE'].includes(String(v || '').trim().toUpperCase());
  const isStockPurchaseClaim = Boolean(
    String(claim.claimType || '').toUpperCase() === 'STOCK_PURCHASE' ||
    String(claim.expenseType || '').toUpperCase() === 'STOCK_PURCHASE' ||
    combinedEntries.some(
      (e) =>
        String(e?.expenseType || '').toUpperCase() === 'STOCK_PURCHASE' ||
        String(e?.otherSubType || '').toUpperCase() === 'PURCHASE'
    )
  );
  const isOtherClaim = Boolean(
    isOtherCode(claim.claimType) ||
    isOtherCode(claim.expenseType) ||
    mgr.kind === 'OTHER_EXPENSE' ||
    mgr.approverRole === 'REPORTING_MANAGER' ||
    combinedEntries.some((e) => isOtherCode(e?.expenseType) || isOtherSub(e?.otherSubType))
  );

  const showFinanceCard =
    !isClaimantManagement &&
    Boolean(
      isCfoApplicableByRule ||
      (fin.status && fin.status !== 'NOT_REQUIRED') ||
      fin.approver ||
      fin.approverName ||
      fin.decidedAt ||
      fin.remarks
    );

  const isMgrExplicitlyNotRequired =
    mgr.status === 'NOT_REQUIRED' &&
    (!mgr.kind || mgr.kind === 'NONE') &&
    !mgr.decidedAt &&
    !mgr.remarks &&
    !isFullPayment &&
    !showFinanceCard;

  const showManagerCard =
    !isClaimantManagement &&
    !isMgrExplicitlyNotRequired &&
    Boolean(
      isFullPayment ||
      isCfoApplicableByRule ||
      (isOtherClaim && mgr.status !== 'NOT_REQUIRED') ||
      (mgr.status && mgr.status !== 'NOT_REQUIRED') ||
      mgr.approver ||
      mgr.approverName ||
      mgr.decidedAt ||
      mgr.remarks
    );

  // 1st Approval (Reporting Manager) status & details
  const subReportsTo =
    subObj.reportsTo && typeof subObj.reportsTo === 'object' ? subObj.reportsTo : null;
  const mgrObj =
    mgr.approver && typeof mgr.approver === 'object' ? mgr.approver : subReportsTo;
  const mgrName =
    mgrObj?.name ||
    mgr.approverName ||
    fp.decidedByName ||
    (typeof mgr.approver === 'string' ? mgr.approver : '') ||
    'Reporting Manager';
  const mgrCode = mgrObj?.employeeIdCode || '';
  const mgrDesig = mgrObj?.designation || '';
  const mgrDept = mgrObj?.department || '';

  const isMgrRejected = mgr.status === 'REJECTED' || (!mgr.status && fp.status === 'REJECTED');
  const isMgrApproved =
    !isMgrRejected &&
    Boolean(
      mgr.status === 'APPROVED' ||
      fp.status === 'APPROVED' ||
      fin.status === 'PENDING' ||
      fin.status === 'APPROVED' ||
      ['SUBMITTED', 'APPROVED', 'ACCOUNTS_APPROVED', 'PAID', 'DISBURSED', 'SETTLED'].includes(statusUpper) ||
      isPaid
    );
  const mgrStatus = isMgrApproved ? 'APPROVED' : isMgrRejected ? 'REJECTED' : 'PENDING';
  const mgrDecidedAt = mgr.decidedAt || fp.decidedAt || null;
  const mgrRemarks = mgr.remarks || fp.decisionRemarks || '';

  // 2nd Approval (CFO / Finance Head) status & details
  const finObj = fin.approver && typeof fin.approver === 'object' ? fin.approver : null;
  const finName =
    finObj?.name ||
    fin.approverName ||
    (typeof fin.approver === 'string' ? fin.approver : '') ||
    'CFO / Finance Head';
  const finCode = finObj?.employeeIdCode || '';
  const finDesig = finObj?.designation || '';
  const finDept = finObj?.department || '';

  const isFinRejected = fin.status === 'REJECTED';
  const isFinApproved =
    !isFinRejected &&
    !isMgrRejected &&
    Boolean(
      fin.status === 'APPROVED' ||
      (Boolean(fin.decidedAt) &&
        (['SUBMITTED', 'APPROVED', 'ACCOUNTS_APPROVED', 'PAID', 'DISBURSED', 'SETTLED'].includes(statusUpper) ||
          isPaid))
    );
  const finStatus = isFinApproved
    ? 'APPROVED'
    : isFinRejected
      ? 'REJECTED'
      : isMgrRejected
        ? 'CANCELLED'
        : fin.status === 'PENDING' || isMgrApproved
          ? 'PENDING'
          : 'AWAITING_STEP_1';

  // Accounts Admin Approval & Payment details
  const accObj = acc.approvedBy && typeof acc.approvedBy === 'object' ? acc.approvedBy : null;
  const accApprovedByName =
    accObj?.name ||
    acc.approvedByName ||
    (isPaid ? disb.recordedByName || claim.disbursedBy?.name || 'Accounts Admin' : '');
  const accApprovedByCode = accObj?.employeeIdCode || '';
  const accApprovedAt = acc.approvedAt || (isPaid ? disb.paymentDate || claim.disbursedAt : null);
  const accStep1Remarks = acc.remarks || '';
  const isAccountsStep1Approved = Boolean(
    acc.status === 'APPROVED' || statusUpper === 'ACCOUNTS_APPROVED' || isPaid
  );
  const isAccountsRejected =
    acc.status === 'REJECTED' || (isRejected && !isMgrRejected && !isFinRejected);

  const paidAmount = Number(claim.paidAmount ?? disb.amount ?? (isPaid ? claim.payableAmount || allowed : 0));
  const paidAt = claim.paymentDate || claim.disbursedAt || disb.paymentDate || null;
  const paymentMethod = claim.paymentMethod || disb.paymentMethod || '';
  const paymentRef = claim.paymentReference || claim.utr || disb.paymentReference || '';
  const recObj = disb.recordedBy && typeof disb.recordedBy === 'object' ? disb.recordedBy : null;
  const paidByName =
    claim.paidByName || disb.recordedByName || recObj?.name || claim.disbursedBy?.name || accApprovedByName || '';
  const paymentRemarks =
    disb.remarks || (claim.accountsRemarks && claim.accountsRemarks !== accStep1Remarks ? claim.accountsRemarks : '') || '';
  const paymentProofsList =
    Array.isArray(claim.paymentProofs) && claim.paymentProofs.length > 0
      ? claim.paymentProofs
      : Array.isArray(disb.paymentProofs) && disb.paymentProofs.length > 0
        ? disb.paymentProofs
        : disb.paymentProof?.url
          ? [disb.paymentProof]
          : [];

  const payable = Number(
    claim.payableAmount ??
    (isFullPayment && (fp.status === 'APPROVED' || isFinApproved || isClaimantManagement) ? requested : allowed)
  );

  // Policy explanation & rules (Section 6)
  const plainExplanation =
    claim.plainExplanation ||
    employeeClaims[0]?.items?.[0]?.calculationBreakdown?.plainExplanation ||
    employeeClaims[0]?.items?.[0]?.plainExplanation ||
    '';
  const parsedExplanation = parsePolicyExplanation(plainExplanation);
  const appliedRules = Array.isArray(claim.appliedRules) ? claim.appliedRules : [];

  // Claim-level receipts not already shown inside entries
  const entryReceiptUrls = new Set(
    combinedEntries.flatMap((e) => (Array.isArray(e.receipts) ? e.receipts.map(resolveProofUrl) : []))
  );
  const extraClaimReceipts = (Array.isArray(claim.receipts) ? claim.receipts : []).filter(
    (r) => !entryReceiptUrls.has(resolveProofUrl(r))
  );

  // Journey Steps (Section 8)
  const buildJourneySteps = () => {
    const steps = [];
    let stepNum = 1;

    steps.push({
      num: stepNum++,
      title: 'Claim Submitted',
      badge: 'Submitted',
      tone: 'emerald',
      desc: `Submitted by ${employeeSlots[0]?.name || 'Employee'}${employeeSlots[0]?.employeeIdCode ? ` (${employeeSlots[0].employeeIdCode})` : ''
        } on ${formatDateTime(claim.submittedAt || claim.createdAt)} for ${fmtINR(requested)}.`,
    });

    if (showManagerCard) {
      const mWho = `${mgrName}${mgrCode ? ` (${mgrCode})` : ''}`;
      const mKind = isFullPayment ? 'Full Payment' : isStockPurchaseClaim ? 'Stock Purchase' : 'Other Expense';
      steps.push({
        num: stepNum++,
        title: `${showFinanceCard ? '1st Approval: ' : ''}Reporting Manager (${mKind})`,
        badge: isMgrApproved ? 'Approved' : isMgrRejected ? 'Rejected' : 'Pending',
        tone: isMgrApproved ? 'emerald' : isMgrRejected ? 'rose' : 'amber',
        desc: isMgrApproved
          ? `Approved by ${mWho}${mgrDecidedAt ? ` on ${formatDateTime(mgrDecidedAt)}` : ''}.${mgrRemarks ? ` Remark: "${mgrRemarks}"` : ''
          }`
          : isMgrRejected
            ? `Rejected by ${mWho}${mgrDecidedAt ? ` on ${formatDateTime(mgrDecidedAt)}` : ''}.${mgrRemarks ? ` Reason: "${mgrRemarks}"` : ''
            }`
            : `Awaiting 1st approval from ${mWho}.`,
      });
    }

    if (showFinanceCard) {
      const fWho = `${finName}${finCode ? ` (${finCode})` : ''}`;
      steps.push({
        num: stepNum++,
        title: '2nd Approval: CFO / Finance Head',
        badge: isFinApproved
          ? 'Approved'
          : isFinRejected
            ? 'Rejected'
            : isMgrRejected
              ? 'Cancelled'
              : isMgrApproved
                ? 'In Review'
                : 'Waiting',
        tone: isFinApproved ? 'emerald' : isFinRejected || isMgrRejected ? 'rose' : 'amber',
        desc: isFinApproved
          ? `Approved by ${fWho}${fin.decidedAt ? ` on ${formatDateTime(fin.decidedAt)}` : ''}.${fin.remarks ? ` Remark: "${fin.remarks}"` : ''
          }`
          : isFinRejected
            ? `Rejected by ${fWho}${fin.decidedAt ? ` on ${formatDateTime(fin.decidedAt)}` : ''}.${fin.remarks ? ` Reason: "${fin.remarks}"` : ''
            }`
            : isMgrRejected
              ? 'Cancelled because 1st Approval (Reporting Manager) was rejected.'
              : isMgrApproved
                ? `Forwarded to ${fWho} for 2nd approval.`
                : 'Will be routed to CFO / Finance Head after 1st Approval.',
      });
    }

    const aWho = accApprovedByName
      ? `${accApprovedByName}${accApprovedByCode ? ` (${accApprovedByCode})` : ''}`
      : 'Accounts Admin';
    steps.push({
      num: stepNum++,
      title: 'Accounts Admin Approval (Step 1)',
      badge: isAccountsStep1Approved
        ? 'Approved'
        : isAccountsRejected
          ? 'Rejected'
          : isMgrRejected || isFinRejected
            ? 'Cancelled'
            : 'Pending',
      tone: isAccountsStep1Approved
        ? 'emerald'
        : isAccountsRejected || isMgrRejected || isFinRejected
          ? 'rose'
          : 'amber',
      desc: isAccountsStep1Approved
        ? `Verified & approved by ${aWho}${accApprovedAt ? ` on ${formatDateTime(accApprovedAt)}` : ''}.${accStep1Remarks ? ` Remark: "${accStep1Remarks}"` : ''
        }`
        : isAccountsRejected
          ? `Rejected by ${rej.rejectedByName || aWho}${rej.rejectedAt ? ` on ${formatDateTime(rej.rejectedAt)}` : ''
          }.${rej.reason ? ` Reason: "${rej.reason}"` : ''}`
          : isMgrRejected || isFinRejected
            ? 'Cancelled due to prior approval rejection.'
            : statusUpper === 'SUBMITTED'
              ? 'Awaiting Accounts Admin Step 1 verification & approval.'
              : 'Will be routed to Accounts Admin after prior approvals complete.',
    });

    steps.push({
      num: stepNum++,
      title: 'Payment & Settlement (Step 2)',
      badge: isPaid ? 'Paid' : isRejected ? 'Cancelled' : isAccountsStep1Approved ? 'Awaiting Payment' : 'Pending',
      tone: isPaid ? 'emerald' : isRejected ? 'rose' : 'amber',
      desc: isPaid
        ? `Disbursed ${fmtINR(paidAmount)} via ${paymentMethod || 'Bank Transfer'}${paymentRef ? ` (UTR/Ref: ${paymentRef})` : ''
        }${paidAt ? ` on ${formatDateTime(paidAt)}` : ''}${paidByName ? ` by ${paidByName}` : ''}.${paymentRemarks ? ` Remark: "${paymentRemarks}"` : ''
        }`
        : isRejected
          ? 'Payment cancelled because the claim was rejected.'
          : isAccountsStep1Approved
            ? `Approved for ${fmtINR(payable)} — awaiting disbursement & UTR recording by Accounts Admin.`
            : 'Payment will be processed after Accounts Admin Step 1 approval.',
    });

    return steps;
  };

  const journeySteps = buildJourneySteps();

  // Build 3-Level Category -> Entries grouping for Section 4
  const CATEGORY_META = {
    TRAVEL: { title: 'Travel Claim', icon: '✈️' },
    CONVEYANCE: { title: 'Local Conveyance Claim', icon: '🚗' },
    FOOD: { title: 'Food Claim', icon: '🍽️' },
    LODGING: { title: 'Accommodation Claim', icon: '🏨' },
    STOCK_PURCHASE: { title: 'Stock Purchase Claim', icon: '📦' },
    OTHER: { title: 'Other Expense Claim', icon: '🧾' },
  };

  const categoryGroupsMap = new Map();
  combinedEntries.forEach((entry, idx) => {
    const rawCode = String(entry.expenseType || claim.expenseType || claim.claimType || 'OTHER').toUpperCase();
    const isPurchase =
      rawCode === 'STOCK_PURCHASE' ||
      (rawCode === 'OTHER' && String(entry.otherSubType || '').toUpperCase() === 'PURCHASE');
    const normCode = isPurchase
      ? 'STOCK_PURCHASE'
      : rawCode === 'LOGGING' || rawCode === 'LODGING_EXPENSE'
        ? 'LODGING'
        : rawCode === 'FOOD_EXPENSE'
          ? 'FOOD'
          : rawCode === 'LOCAL_CONVEYANCE'
            ? 'CONVEYANCE'
            : rawCode === 'OTHER_EXPENSE'
              ? 'OTHER'
              : CATEGORY_META[rawCode]
                ? rawCode
                : 'OTHER';

    if (!categoryGroupsMap.has(normCode)) {
      const meta = CATEGORY_META[normCode] || { title: `${normCode} Claim`, icon: '📋' };
      categoryGroupsMap.set(normCode, {
        key: normCode,
        title: meta.title,
        icon: meta.icon,
        entries: [],
        foodSummaryCard: null,
        totalClaimed: 0,
        totalAllowed: 0,
        totalExcess: 0,
      });
    }
    const grp = categoryGroupsMap.get(normCode);
    grp.entries.push({ entry, globalIdx: idx });
    grp.totalClaimed += Number(entry.requestedAmount) || 0;
    grp.totalAllowed += Number(entry.allowedAmount ?? entry.requestedAmount) || 0;
    grp.totalExcess += Number(entry.excessAmount ?? Math.max(0, (Number(entry.requestedAmount) || 0) - (Number(entry.allowedAmount ?? entry.requestedAmount) || 0))) || 0;
  });

  if (foodSummary) {
    if (!categoryGroupsMap.has('FOOD')) {
      categoryGroupsMap.set('FOOD', {
        key: 'FOOD',
        title: CATEGORY_META.FOOD.title,
        icon: CATEGORY_META.FOOD.icon,
        entries: [],
        foodSummaryCard: foodSummary,
        totalClaimed: Number(foodSummary.requestedAmount) || 0,
        totalAllowed: Number(foodSummary.allowedAmount) || 0,
        totalExcess: Number(foodSummary.excessAmount) || 0,
      });
    } else {
      const fGrp = categoryGroupsMap.get('FOOD');
      fGrp.foodSummaryCard = foodSummary;
      fGrp.totalClaimed += Number(foodSummary.requestedAmount) || 0;
      fGrp.totalAllowed += Number(foodSummary.allowedAmount) || 0;
      fGrp.totalExcess += Number(foodSummary.excessAmount) || 0;
    }
  }

  const categoryGroups = Array.from(categoryGroupsMap.values());

  const isCategoryExpanded = (key) => !collapsedCategories[key];
  const toggleCategory = (key) => {
    setCollapsedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const allExpanded = categoryGroups.every((g) => isCategoryExpanded(g.key));
  const toggleAllCategories = () => {
    if (allExpanded) {
      const next = {};
      categoryGroups.forEach((g) => {
        next[g.key] = true;
      });
      setCollapsedCategories(next);
    } else {
      setCollapsedCategories({});
    }
  };

  return (
    <div className="space-y-4 text-slate-800">
      {/* 1. Claim Date / Lodging Stay Dates */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h4 className="text-sm font-extrabold text-slate-900 mb-3">
          1. {isLodging ? 'Lodging Stay Dates' : 'Claim Date'}
        </h4>
        {isLodging ? (
          <div className="space-y-1.5">
            <DetailRow label="Stay Period" value={`${formatDate(fromDate)} → ${formatDate(toDate)}`} />
            <p className="text-xs font-bold text-indigo-600 py-1">
              {lodgingNights} lodging night{lodgingNights === 1 ? '' : 's'} • {foodDays} food day
              {foodDays === 1 ? '' : 's'}
            </p>
            <DetailRow
              label="Stay Type"
              value={stayType === 'WITH_RELATIVE' ? '🏠 Stay with Relative' : '🏨 Stay in Hotel'}
            />
          </div>
        ) : (
          <DetailRow label="Claim Date" value={formatDate(claimDate)} />
        )}
      </div>

      {/* 2. Selected Employees */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-extrabold text-slate-900">2. Selected Employees</h4>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            {numEmployees} Employee{numEmployees === 1 ? '' : 's'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {employeeSlots.map((emp, i) => (
            <div key={emp._id || i} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-600 text-white">
                  #{i + 1}
                </span>
                <span className="text-[11px] font-bold text-slate-600">
                  {i === 0 ? 'Employee #1 (Primary / Myself)' : `Employee #${i + 1}`}
                </span>
              </div>
              <p className="text-sm font-extrabold text-slate-900">
                {emp.name}{' '}
                {emp.employeeIdCode ? (
                  <span className="text-xs font-bold text-indigo-600">[{emp.employeeIdCode}]</span>
                ) : null}
              </p>
              {(emp.designation || emp.levelName || emp.department) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {[emp.designation || emp.levelName, emp.department].filter(Boolean).join(' • ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Customer & Destination */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h4 className="text-sm font-extrabold text-slate-900 mb-3">3. Customer & Destination</h4>
        <div className="space-y-1">
          <DetailRow label="Customer Name" value={claim.trip?.customerName || claim.customerName || '—'} />
          <DetailRow
            label="Destination City"
            value={`${claim.trip?.destination || claim.destinationCity || '—'}${claim.trip?.destinationClass ? ` (Class ${claim.trip.destinationClass})` : ''
              }`}
          />
          <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">Visit Option</span>
            <span
              className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] border ${isVisitClaim
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
            >
              {isVisitClaim ? '2. Service Call (Service Report Compulsory)' : '1. Normal Travel'}
            </span>
          </div>
          {claim.trip?.travelMode ? <DetailRow label="Travel Mode" value={claim.trip.travelMode} /> : null}
          {claim.remark || claim.trip?.purpose || claim.purpose ? (
            <DetailRow label="Remark / Purpose" value={claim.remark || claim.trip?.purpose || claim.purpose} />
          ) : null}
        </div>
      </div>

      {/* 4. Expense Details — Three-Level Expandable Claim Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-extrabold text-slate-900">4. Expense Details</h4>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            {combinedEntries.length + (foodSummary ? 1 : 0)}{' '}
            {combinedEntries.length + (foodSummary ? 1 : 0) === 1 ? 'Entry' : 'Entries'}
          </span>
        </div>

        {/* Level 1 – Main Claim Record Summary Banner */}
        <div className="rounded-xl border border-slate-200 bg-slate-900 text-white p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold tracking-wide text-indigo-300">
              {claim.claimNumber || claim.claimId || 'EXPENSE CLAIM'}
            </p>
            <p className="text-xs font-semibold text-slate-200 mt-0.5">
              Employee: <span className="font-extrabold text-white">{employeeSlots[0]?.name || 'Employee'}</span>
              {numEmployees > 1 ? ` (+${numEmployees - 1} more)` : ''} ·{' '}
              {isLodging ? `${formatDate(fromDate)} – ${formatDate(toDate)}` : formatDate(claimDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${isPaid
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                  : isRejected
                    ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                    : isAccountsStep1Approved
                      ? 'bg-blue-500/20 text-blue-200 border-blue-400/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                }`}
            >
              {isPaid
                ? 'Paid'
                : isRejected
                  ? 'Rejected'
                  : isAccountsStep1Approved
                    ? 'Approved • Payment Pending'
                    : 'Pending'}
            </span>
          </div>
        </div>

        {/* Level 2 – Claim Categories Header */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs font-extrabold text-slate-700 tracking-wider">
            Claim Categories ({categoryGroups.length})
          </p>
          {categoryGroups.length > 0 && (
            <button
              type="button"
              onClick={toggleAllCategories}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        </div>

        {/* Level 2 – Expandable Category Cards */}
        <div className="space-y-3">
          {categoryGroups.map((group) => {
            const expanded = isCategoryExpanded(group.key);
            const totalCatEntriesCount = group.entries.length + (group.foodSummaryCard ? 1 : 0);

            return (
              <div key={group.key} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                {/* Category Header Row (Click to Expand / Collapse) */}
                <button
                  type="button"
                  onClick={() => toggleCategory(group.key)}
                  className="w-full flex items-center justify-between gap-3 p-3.5 bg-slate-50 hover:bg-slate-100/80 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="p-1 rounded-lg bg-white border border-slate-200 text-slate-600 shrink-0">
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <span className="text-base shrink-0">{group.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">{group.title}</p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {totalCatEntriesCount} {totalCatEntriesCount === 1 ? 'entry' : 'entries'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {group.totalExcess > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-700 border border-rose-300">
                        {fmtINR(group.totalExcess)} Excess
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Fully Allowed
                      </span>
                    )}
                    <div className="text-right">
                      <p className="text-xs sm:text-sm font-extrabold text-slate-900">{fmtINR(group.totalClaimed)}</p>
                      <p className="text-[10px] font-semibold text-emerald-700">
                        Allowed: {fmtINR(group.totalAllowed)}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Level 3 – Expanded Individual Claim Entries */}
                {expanded && (
                  <div className="p-3.5 space-y-3 border-t border-slate-200 bg-white">
                    {group.entries.map(({ entry, globalIdx }, localIdx) => {
                      const typeCode = String(
                        entry.expenseType || claim.expenseType || claim.claimType || 'EXPENSE'
                      ).toUpperCase();
                      const isPurchase =
                        typeCode === 'STOCK_PURCHASE' ||
                        (typeCode === 'OTHER' && String(entry.otherSubType || '').toUpperCase() === 'PURCHASE');
                      const isOtherNormal = typeCode === 'OTHER' && !isPurchase;
                      const isTravel = typeCode === 'TRAVEL';
                      const isConveyance = typeCode === 'CONVEYANCE';
                      const isEntryLodging = typeCode === 'LODGING' || typeCode === 'LOGGING';
                      const typeLabel = EXPENSE_TYPE_LABELS[typeCode] || typeCode;

                      const entryTitle = isPurchase
                        ? entry.materialName || entry.description || 'Stock Purchase'
                        : isTravel
                          ? entry.travelModeName
                            ? `${entry.travelModeName}${entry.travelSubTypeName ? ` (${entry.travelSubTypeName})` : ''
                            }`
                            : entry.description || 'Travel Charges'
                          : isConveyance
                            ? VEHICLE_LABELS[entry.vehicle] ||
                            entry.travelModeName ||
                            entry.description ||
                            'Local Travel'
                            : isEntryLodging
                              ? entry.hotelName ||
                              (stayType === 'WITH_RELATIVE' ? 'Stay with Relative' : 'Hotel Accommodation')
                              : isOtherNormal
                                ? entry.description || 'Other Expense'
                                : entry.description || typeLabel;

                      const entryDateStr = isEntryLodging
                        ? `${formatDate(entry.fromDate || fromDate)} → ${formatDate(entry.toDate || toDate)}`
                        : formatDate(entry.date || entry.expenseDate || claimDate);

                      const entrySubContext = [
                        claim.trip?.destination
                          ? `${claim.trip.destination}${claim.trip.destinationClass ? ` (Class ${claim.trip.destinationClass})` : ''
                          }`
                          : '',
                        entry.distanceKm ? `${entry.distanceKm} km` : '',
                        entry.description || entry.remark || claim.trip?.purpose || '',
                      ]
                        .filter(Boolean)
                        .join(' · ');

                      const entryReq = Number(entry.requestedAmount) || 0;
                      const entryAllow = Number(entry.allowedAmount ?? entryReq) || 0;
                      const entryExc = Number(entry.excessAmount ?? Math.max(0, entryReq - entryAllow)) || 0;
                      const entryLim = Number(entry.policyLimit ?? entryAllow) || 0;

                      const entryReceipts = Array.isArray(entry.receipts) ? entry.receipts : [];
                      const vehiclePhotos = Array.isArray(entry.numberPlatePhotos) ? entry.numberPlatePhotos : [];
                      const startKmPhotos = Array.isArray(entry.startKmPhotos) ? entry.startKmPhotos : [];
                      const endKmPhotos = Array.isArray(entry.endKmPhotos) ? entry.endKmPhotos : [];
                      const entryServiceReports = Array.isArray(entry.serviceReports) ? entry.serviceReports : [];

                      const isOwnVehicle =
                        Boolean(entry.isOwnVehicle) ||
                        ['OWN', 'BIKE', 'CAR', 'TWO_WHEELER', 'FOUR_WHEELER'].some((k) =>
                          String(entry.travelModeCode || entry.travelModeName || '')
                            .toUpperCase()
                            .includes(k)
                        );

                      const entryIcon = (() => {
                        if (isEntryLodging) return stayType === 'WITH_RELATIVE' ? '🏠' : '🏨';
                        if (isTravel) {
                          const m = String(entry.travelModeCode || entry.travelModeName || '').toUpperCase();
                          if (m.includes('FLIGHT') || m.includes('AIR')) return '✈️';
                          if (m.includes('BUS')) return '🚌';
                          if (m.includes('CAB') || m.includes('TAXI') || m.includes('AUTO') || m.includes('FOUR_WHEELER') || m.includes('CAR')) return '🚗';
                          if (m.includes('TWO_WHEELER') || m.includes('BIKE')) return '🏍️';
                          return '🚆';
                        }
                        if (isConveyance) {
                          if (entry.vehicle === 'twoWheeler') return '🏍️';
                          if (entry.vehicle === 'eBike' || entry.vehicle === 'eCar') return '⚡';
                          return '🚗';
                        }
                        if (typeCode === 'FOOD' || typeCode === 'FOOD_DA' || typeCode === 'FOOD_EXPENSE') return '🍽️';
                        if (isPurchase) return '📦';
                        return '🧾';
                      })();

                      return (
                        <div
                          key={globalIdx}
                          className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5"
                        >
                          {/* Entry Header Row: Entry 01 – Title | Amount | Date · Route */}
                          <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-slate-200">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold bg-indigo-600 text-white shrink-0">
                                  <span>{entryIcon}</span>
                                  <span>Entry {String(globalIdx + 1).padStart(2, '0')}</span>
                                </span>
                                <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                                  {entryIcon} {entryTitle}
                                </span>
                              </div>
                              <p className="text-[11px] font-medium text-slate-500 mt-1">
                                {entryDateStr}
                                {entrySubContext ? ` · ${entrySubContext}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold shrink-0 ${entryExc > 0
                                    ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  }`}
                              >
                                {entryExc > 0 ? `${fmtINR(entryExc)} Excess` : 'Fully Allowed'}
                              </span>
                              <span className="text-sm font-extrabold text-slate-900">{fmtINR(entryReq)}</span>
                            </div>
                          </div>

                          {/* Purchase Details */}
                          {isPurchase && (
                            <div className="space-y-1">
                              {entry.materialName || entry.description ? (
                                <DetailRow label="Material Name" value={entry.materialName || entry.description} />
                              ) : null}
                              {entry.barcode || entry.barcodeNumber ? (
                                <DetailRow label="Barcode Number" value={entry.barcode || entry.barcodeNumber} />
                              ) : null}
                              {entry.quantity ? <DetailRow label="Quantity" value={String(entry.quantity)} /> : null}
                            </div>
                          )}

                          {/* Travel Details */}
                          {isTravel && (
                            <div className="space-y-1">
                              <DetailRow
                                label="Travel Mode"
                                value={
                                  entry.travelModeName
                                    ? `${entry.travelModeName}${entry.travelSubTypeName ? ` — ${entry.travelSubTypeName}` : ''
                                    }`
                                    : entry.travelMode || claim.trip?.travelMode || '—'
                                }
                              />
                              {isOwnVehicle && (entry.distanceKm || entry.ratePerKm) ? (
                                <DetailRow
                                  label="Distance & Rate"
                                  value={`${entry.distanceKm || 0} km × ₹${entry.ratePerKm || 0}/km = ${fmtINR(
                                    entryReq
                                  )}`}
                                />
                              ) : null}
                              {entry.entitlementStatus ? (
                                <DetailRow
                                  label="Entitlement"
                                  value={
                                    entry.entitlementStatus === 'ALLOWED'
                                      ? 'Allowed — Within Policy'
                                      : entry.entitlementStatus === 'MAX_LIMIT'
                                        ? `Max Limit ${fmtINR(entryLim)}`
                                        : 'Not Allowed — Treated as Excess'
                                  }
                                />
                              ) : null}
                              {entry.plainExplanation ? (
                                <DetailRow
                                  label="Policy Note"
                                  value={cleanExplanationText(entry.plainExplanation)}
                                  valueClass="text-slate-700 font-medium"
                                />
                              ) : null}
                            </div>
                          )}

                          {/* Conveyance Details */}
                          {isConveyance && (
                            <div className="space-y-1">
                              <DetailRow
                                label="Travel Mode"
                                value={
                                  VEHICLE_LABELS[entry.vehicle] ||
                                  entry.travelModeName ||
                                  entry.vehicle ||
                                  'Local Conveyance'
                                }
                              />
                              <DetailRow
                                label="Visit Option"
                                value={
                                  String(entry.visitType || '').toUpperCase() === 'VISIT' ||
                                    entry.isVisit ||
                                    isVisitClaim
                                    ? '2. Service Call (Service Report Compulsory)'
                                    : '1. Normal Travel'
                                }
                              />
                              {entry.distanceKm ? (
                                <DetailRow
                                  label="Distance"
                                  value={`${entry.distanceKm} km${entry.startKm !== undefined && entry.endKm !== undefined
                                      ? ` (Odometer: ${entry.startKm} → ${entry.endKm} km)`
                                      : ''
                                    }`}
                                />
                              ) : null}
                              {entry.distanceKm && entry.ratePerKm ? (
                                <DetailRow
                                  label="Calculation"
                                  value={`${entry.distanceKm} km × ₹${entry.ratePerKm}/km = ${fmtINR(entryReq)}`}
                                />
                              ) : null}
                            </div>
                          )}

                          {/* Lodging Entry Details */}
                          {isEntryLodging && (
                            <div className="space-y-1">
                              {entry.hotelName ? <DetailRow label="Hotel / Stay" value={entry.hotelName} /> : null}
                              <DetailRow
                                label="Accommodation Type"
                                value={stayType === 'WITH_RELATIVE' ? '🏠 Stay with Relative' : '🏨 Stay in Hotel'}
                              />
                              {entry.numEmps > 1 ? (
                                <DetailRow label="Shared With" value={`${entry.numEmps} Employees`} />
                              ) : null}
                            </div>
                          )}

                          {/* 4-Column Figures Grid (Excess in RED) */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                            <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
                              <p className="text-[10px] font-bold text-slate-400">Claimed</p>
                              <p className="text-xs font-extrabold text-slate-900 mt-0.5">{fmtINR(entryReq)}</p>
                            </div>
                            <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-2 text-center">
                              <p className="text-[10px] font-bold text-indigo-500">Policy Limit</p>
                              <p className="text-xs font-extrabold text-indigo-700 mt-0.5">
                                {entryLim > 0 ? fmtINR(entryLim) : 'Actual'}
                              </p>
                            </div>
                            <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 p-2 text-center">
                              <p className="text-[10px] font-bold text-emerald-600">Allowed</p>
                              <p className="text-xs font-extrabold text-emerald-700 mt-0.5">{fmtINR(entryAllow)}</p>
                            </div>
                            <div className="rounded-lg bg-rose-50/70 border border-rose-200 p-2 text-center">
                              <p className="text-[10px] font-bold text-rose-600">Excess</p>
                              <p className="text-xs font-extrabold text-rose-700 mt-0.5">{fmtINR(entryExc)}</p>
                            </div>
                          </div>

                          {entry.description || entry.remark ? (
                            <DetailRow label="Remark" value={entry.description || entry.remark} />
                          ) : null}

                          {entryReceipts.length > 0 && (
                            <div className="pt-1">
                              <p className="text-xs font-bold text-slate-600">
                                Receipt Proofs ({entryReceipts.length})
                              </p>
                              <ProofGrid items={entryReceipts} />
                            </div>
                          )}

                          {isConveyance && vehiclePhotos.length > 0 && (
                            <div className="pt-1">
                              <p className="text-xs font-bold text-slate-600">
                                🚗 Vehicle Number Plate Photo ({vehiclePhotos.length})
                              </p>
                              <ProofGrid items={vehiclePhotos} />
                            </div>
                          )}

                          {isConveyance && startKmPhotos.length > 0 && (
                            <div className="pt-1">
                              <p className="text-xs font-bold text-slate-600">
                                🔢 Start KM Odometer Photo ({startKmPhotos.length})
                              </p>
                              <ProofGrid items={startKmPhotos} />
                            </div>
                          )}

                          {isConveyance && endKmPhotos.length > 0 && (
                            <div className="pt-1">
                              <p className="text-xs font-bold text-slate-600">
                                🏁 End KM Odometer Photo ({endKmPhotos.length})
                              </p>
                              <ProofGrid items={endKmPhotos} />
                            </div>
                          )}

                          {isConveyance && entryServiceReports.length > 0 && (
                            <div className="pt-1">
                              <p className="text-xs font-bold text-slate-600">
                                📑 Service Call Report ({entryServiceReports.length})
                              </p>
                              <ProofGrid items={entryServiceReports} />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Shared Food Allowance Entry Card inside Food Category */}
                    {group.foodSummaryCard && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-slate-200">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-extrabold bg-indigo-600 text-white">
                                <span>🍽️</span>
                                <span>Entry {String(combinedEntries.length + 1).padStart(2, '0')}</span>
                              </span>
                              <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                                🍽️ Shared Food Allowance
                              </span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-500 mt-1">
                              {formatDate(group.foodSummaryCard.fromDate)} →{' '}
                              {formatDate(group.foodSummaryCard.toDate)} ({group.foodSummaryCard.days} day
                              {group.foodSummaryCard.days === 1 ? '' : 's'})
                            </p>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${group.foodSummaryCard.excessAmount > 0
                                  ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                            >
                              {group.foodSummaryCard.excessAmount > 0
                                ? `${fmtINR(group.foodSummaryCard.excessAmount)} Excess`
                                : 'Fully Allowed'}
                            </span>
                            <span className="text-sm font-extrabold text-slate-900">
                              {fmtINR(group.foodSummaryCard.requestedAmount)}
                            </span>
                          </div>
                        </div>

                        <DetailRow
                          label="Employees Covered"
                          value={`${numEmployees} Employee${numEmployees === 1 ? '' : 's'}`}
                        />
                        <DetailRow
                          label="Calculation Rule"
                          value="100% of Combined Daily Food Limits (No 75% reduction)"
                        />

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
                            <p className="text-[10px] font-bold text-slate-400">Claimed</p>
                            <p className="text-xs font-extrabold text-slate-900 mt-0.5">
                              {fmtINR(group.foodSummaryCard.requestedAmount)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-2 text-center">
                            <p className="text-[10px] font-bold text-indigo-500">Policy Limit</p>
                            <p className="text-xs font-extrabold text-indigo-700 mt-0.5">
                              {fmtINR(group.foodSummaryCard.policyLimit)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 p-2 text-center">
                            <p className="text-[10px] font-bold text-emerald-600">Allowed</p>
                            <p className="text-xs font-extrabold text-emerald-700 mt-0.5">
                              {fmtINR(group.foodSummaryCard.allowedAmount)}
                            </p>
                          </div>
                          <div className="rounded-lg bg-rose-50/70 border border-rose-200 p-2 text-center">
                            <p className="text-[10px] font-bold text-rose-600">Excess</p>
                            <p className="text-xs font-extrabold text-rose-700 mt-0.5">
                              {fmtINR(group.foodSummaryCard.excessAmount)}
                            </p>
                          </div>
                        </div>

                        {group.foodSummaryCard.plainExplanation ? (
                          <DetailRow
                            label="Food Calculation Explanation"
                            value={cleanExplanationText(group.foodSummaryCard.plainExplanation)}
                          />
                        ) : null}
                        {group.foodSummaryCard.remark ? (
                          <DetailRow label="Food Remark" value={group.foodSummaryCard.remark} />
                        ) : null}
                        {Array.isArray(group.foodSummaryCard.receipts) &&
                          group.foodSummaryCard.receipts.length > 0 && (
                            <div className="pt-1">
                              <p className="text-xs font-bold text-slate-600">
                                Food Receipt Proofs ({group.foodSummaryCard.receipts.length})
                              </p>
                              <ProofGrid items={group.foodSummaryCard.receipts} />
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {extraClaimReceipts.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-bold text-slate-600">Receipt Proofs ({extraClaimReceipts.length})</p>
              <ProofGrid items={extraClaimReceipts} />
            </div>
          )}
        </div>

        {/* Total Claim Amount Summary Bar */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-slate-900 tracking-wider">Total Claim Amount</p>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
              <span className="font-bold text-emerald-700">Allowed: {fmtINR(allowed)}</span>
              <span className="font-extrabold text-rose-600">Excess: {fmtINR(excess)}</span>
              <span className="font-bold text-blue-700">Payable: {fmtINR(payable)}</span>
            </div>
          </div>
          <p className="text-lg font-extrabold text-slate-900">{fmtINR(requested)}</p>
        </div>
      </div>

      {/* 5. Full Payment Details */}
      {isFullPayment && (
        <div className="bg-purple-50/60 rounded-xl border border-purple-200 p-4 shadow-sm space-y-2">
          <h4 className="text-sm font-extrabold text-purple-900 mb-2">5. Full Payment Details</h4>
          <DetailRow
            label="Full Payment Requested"
            value={`YES (Claim Full ${fmtINR(requested)})`}
            valueClass="text-purple-800 font-extrabold"
          />
          {fp.reason || claim.fullPaymentReason ? (
            <DetailRow label="Reason" value={fp.reason || claim.fullPaymentReason} />
          ) : null}
          {!isClaimantManagement && (
            <DetailRow
              label="Approval Status"
              value={fp.status || (isFinApproved ? 'APPROVED' : isFinRejected || isMgrRejected ? 'REJECTED' : 'PENDING')}
              valueClass={
                fp.status === 'APPROVED' || isFinApproved
                  ? 'text-emerald-700 font-extrabold'
                  : fp.status === 'REJECTED' || isFinRejected || isMgrRejected
                    ? 'text-rose-700 font-extrabold'
                    : 'text-amber-700 font-extrabold'
              }
            />
          )}
          {fullPaymentProofs.length > 0 && (
            <div className="pt-2 border-t border-purple-200">
              <p className="text-xs font-bold text-purple-900">
                ⚡ Full Payment Proofs ({fullPaymentProofs.length})
              </p>
              <ProofGrid items={fullPaymentProofs} accent="purple" />
            </div>
          )}
        </div>
      )}

      {/* 1st Approval Card: Reporting Manager */}
      {showManagerCard && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-extrabold text-slate-900">
              {showFinanceCard ? '1st Approval: ' : ''}Reporting Manager Approval (
              {isFullPayment
                ? 'Full Payment'
                : isStockPurchaseClaim
                  ? 'Stock Purchase'
                  : EXPENSE_TYPE_LABELS[rawClaimType] || 'Other Expense'}
              )
            </h4>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${mgrStatus === 'APPROVED'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : mgrStatus === 'REJECTED'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
            >
              {mgrStatus === 'APPROVED' ? 'Approved' : mgrStatus === 'REJECTED' ? 'Rejected' : 'Pending'}
            </span>
          </div>

          <DetailRow
            label="Reporting Manager"
            value={
              <div>
                <p className="font-extrabold text-slate-900">
                  {mgrName} {mgrCode ? <span className="text-indigo-600">({mgrCode})</span> : null}
                </p>
                {(mgrDesig || mgrDept) && (
                  <p className="text-[11px] text-slate-500 font-normal">
                    {[mgrDesig, mgrDept].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
            }
          />
          <DetailRow
            label="Approval Status"
            value={
              mgrStatus === 'APPROVED'
                ? 'APPROVED'
                : mgrStatus === 'REJECTED'
                  ? 'REJECTED'
                  : 'AWAITING 1ST APPROVAL'
            }
            valueClass={
              mgrStatus === 'APPROVED'
                ? 'text-emerald-700 font-extrabold'
                : mgrStatus === 'REJECTED'
                  ? 'text-rose-700 font-extrabold'
                  : 'text-amber-700 font-extrabold'
            }
          />
          {mgr.requestedAt ? <DetailRow label="Requested On" value={formatDateTime(mgr.requestedAt)} /> : null}
          {mgrDecidedAt ? <DetailRow label="Decided On" value={formatDateTime(mgrDecidedAt)} /> : null}
          {mgrRemarks ? <DetailRow label="Decision Remarks" value={mgrRemarks} /> : null}
        </div>
      )}

      {/* 2nd Approval Card: CFO / Finance Head */}
      {showFinanceCard && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-extrabold text-slate-900">2nd Approval: CFO / Finance Head</h4>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${finStatus === 'APPROVED'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : finStatus === 'REJECTED' || finStatus === 'CANCELLED'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
            >
              {finStatus === 'APPROVED'
                ? 'Approved'
                : finStatus === 'REJECTED'
                  ? 'Rejected'
                  : finStatus === 'CANCELLED'
                    ? 'Cancelled'
                    : finStatus === 'PENDING'
                      ? 'Pending'
                      : 'After 1st Approval'}
            </span>
          </div>

          <DetailRow
            label="CFO / Finance Head"
            value={
              <div>
                <p className="font-extrabold text-slate-900">
                  {finName} {finCode ? <span className="text-indigo-600">({finCode})</span> : null}
                </p>
                {(finDesig || finDept) && (
                  <p className="text-[11px] text-slate-500 font-normal">
                    {[finDesig, finDept].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
            }
          />
          <DetailRow
            label="Approval Status"
            value={
              finStatus === 'APPROVED'
                ? 'APPROVED'
                : finStatus === 'REJECTED'
                  ? 'REJECTED'
                  : finStatus === 'CANCELLED'
                    ? 'CANCELLED (1ST APPROVAL REJECTED)'
                    : finStatus === 'PENDING'
                      ? 'AWAITING 2ND APPROVAL'
                      : 'PENDING 1ST APPROVAL'
            }
            valueClass={
              finStatus === 'APPROVED'
                ? 'text-emerald-700 font-extrabold'
                : finStatus === 'REJECTED' || finStatus === 'CANCELLED'
                  ? 'text-rose-700 font-extrabold'
                  : 'text-amber-700 font-extrabold'
            }
          />
          {fin.requestedAt ? <DetailRow label="Requested On" value={formatDateTime(fin.requestedAt)} /> : null}
          {fin.decidedAt ? <DetailRow label="Decided On" value={formatDateTime(fin.decidedAt)} /> : null}
          {fin.remarks ? <DetailRow label="Decision Remarks" value={fin.remarks} /> : null}
        </div>
      )}

      {/* Accounts Admin Approval & Payment Card */}
      {statusUpper !== 'DRAFT' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-extrabold text-slate-900">Accounts Admin Approval & Payment</h4>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${isPaid
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isAccountsStep1Approved
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : isRejected
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
            >
              {isPaid
                ? 'Paid'
                : isAccountsStep1Approved
                  ? 'Approved (Payment Pending)'
                  : isAccountsRejected
                    ? 'Rejected'
                    : isRejected
                      ? 'Cancelled'
                      : statusUpper === 'SUBMITTED'
                        ? 'Awaiting Approval'
                        : 'After Prior Approvals'}
            </span>
          </div>

          <DetailRow
            label="Accounts Status"
            value={
              isPaid
                ? 'APPROVED & PAID'
                : isAccountsStep1Approved
                  ? 'APPROVED BY ACCOUNTS (AWAITING PAYMENT)'
                  : isAccountsRejected
                    ? 'REJECTED BY ACCOUNTS'
                    : isRejected
                      ? 'CANCELLED (PRIOR APPROVAL REJECTED)'
                      : statusUpper === 'SUBMITTED'
                        ? 'PENDING ACCOUNTS APPROVAL'
                        : 'AWAITING PRIOR APPROVALS'
            }
            valueClass={
              isPaid || isAccountsStep1Approved
                ? 'text-emerald-700 font-extrabold'
                : isRejected
                  ? 'text-rose-700 font-extrabold'
                  : 'text-amber-700 font-extrabold'
            }
          />

          {isAccountsStep1Approved && accApprovedByName ? (
            <DetailRow
              label="Approved By (Step 1)"
              value={`${accApprovedByName}${accApprovedByCode ? ` (${accApprovedByCode})` : ''}`}
            />
          ) : null}
          {isAccountsStep1Approved && accApprovedAt ? (
            <DetailRow label="Approved On" value={formatDateTime(accApprovedAt)} />
          ) : null}
          {accStep1Remarks ? <DetailRow label="Approval Remark (Step 1)" value={accStep1Remarks} /> : null}

          {isPaid && (
            <>
              <DetailRow
                label="Paid Amount"
                value={fmtINR(paidAmount)}
                valueClass="text-emerald-700 font-extrabold"
              />
              {paymentMethod ? <DetailRow label="Payment Method" value={paymentMethod} /> : null}
              {paymentRef ? <DetailRow label="Transaction Ref / UTR" value={paymentRef} /> : null}
              {paidByName ? <DetailRow label="Paid / Recorded By (Step 2)" value={paidByName} /> : null}
              {paidAt ? <DetailRow label="Paid On" value={formatDateTime(paidAt)} /> : null}
            </>
          )}

          {isAccountsRejected && (
            <>
              {rej.rejectedByName ? <DetailRow label="Rejected By" value={rej.rejectedByName} /> : null}
              {rej.rejectedAt ? <DetailRow label="Rejected On" value={formatDateTime(rej.rejectedAt)} /> : null}
              {rej.reason ? (
                <DetailRow label="Rejection Reason" value={rej.reason} valueClass="text-rose-700 font-bold" />
              ) : null}
            </>
          )}

          {(Number(claim.pettyCashSummary?.debitedAmount) > 0 ||
            Number(claim.pettyCashSummary?.creditedAmount) > 0) && (
              <DetailRow
                label="Petty Cash Wallet"
                value={
                  isPaid && Number(claim.pettyCashSummary?.creditedAmount) > 0
                    ? `Settled (+${fmtINR(claim.pettyCashSummary.creditedAmount)} credited on payment)`
                    : `Debited ${fmtINR(claim.pettyCashSummary?.debitedAmount || 0)} against advance`
                }
              />
            )}

          {paymentRemarks ? <DetailRow label="Payment Remark (Step 2)" value={paymentRemarks} /> : null}

          {paymentProofsList.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-bold text-emerald-800">
                🧾 Payment Confirmation Proof ({paymentProofsList.length})
              </p>
              <ProofGrid items={paymentProofsList} accent="emerald" />
            </div>
          )}
        </div>
      )}

      {/* 6. Calculation Breakdown & Policy Explanation */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <h4 className="text-sm font-extrabold text-slate-900">
          6. Calculation Breakdown & Policy Explanation
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-center">
            <p className="text-[10px] font-bold text-slate-500">Claimed</p>
            <p className="text-sm font-extrabold text-slate-900 mt-0.5">{fmtINR(requested)}</p>
          </div>
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-2.5 text-center">
            <p className="text-[10px] font-bold text-indigo-600">Policy Limit</p>
            <p className="text-sm font-extrabold text-indigo-800 mt-0.5">
              {policyLimit > 0 ? fmtINR(policyLimit) : 'Actual'}
            </p>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-center">
            <p className="text-[10px] font-bold text-emerald-600">Allowed</p>
            <p className="text-sm font-extrabold text-emerald-800 mt-0.5">{fmtINR(allowed)}</p>
          </div>
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-center">
            <p className="text-[10px] font-bold text-rose-600">Excess</p>
            <p className="text-sm font-extrabold text-rose-700 mt-0.5">{fmtINR(excess)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] font-bold text-blue-600">Payable</p>
            <p className="text-sm font-extrabold text-blue-800 mt-0.5">{fmtINR(payable)}</p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2.5">
          {parsedExplanation.individualLimits.length > 0 && (
            <div>
              <p className="text-xs font-extrabold text-slate-800 mb-1">👤 Individual Limits Per Day</p>
              <ul className="space-y-1">
                {parsedExplanation.individualLimits.map((lim, i) => (
                  <li key={i} className="text-xs text-slate-700 flex items-start gap-2">
                    <span className="text-indigo-600 font-bold">•</span>
                    <span>{lim}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsedExplanation.combinedRule && (
            <div className="pt-1 border-t border-slate-200/80">
              <p className="text-xs font-extrabold text-slate-800 mb-0.5">
                ⚖️ {isLodging ? 'Combined Stay Policy Limit' : 'Combined Daily Policy Limit'}
              </p>
              <p className="text-xs text-slate-700">{parsedExplanation.combinedRule}</p>
            </div>
          )}

          {foodSummary && (
            <div className="pt-1 border-t border-slate-200/80">
              <p className="text-xs font-extrabold text-slate-800 mb-0.5">🍽️ Combined Food Policy Limit</p>
              <p className="text-xs text-slate-700">
                Food Claimed: {fmtINR(foodSummary.requestedAmount)} • Food Policy Limit:{' '}
                {fmtINR(foodSummary.policyLimit)} ({foodSummary.days} days, 100% full entitlement) • Allowed:{' '}
                {fmtINR(foodSummary.allowedAmount)} •{' '}
                <span className="font-bold text-rose-600">Excess: {fmtINR(foodSummary.excessAmount)}</span>
              </p>
            </div>
          )}

          <div
            className={`rounded-lg p-2.5 border ${excess > 0 ? 'bg-rose-50/80 border-rose-200' : 'bg-emerald-50/80 border-emerald-200'
              }`}
          >
            <p className={`text-xs font-extrabold ${excess > 0 ? 'text-rose-800' : 'text-emerald-900'}`}>
              {excess > 0 ? '⚠️ Excess Amount Identified' : '✅ Within Policy Limit'}
            </p>
            <p className={`text-xs mt-0.5 ${excess > 0 ? 'text-rose-700 font-medium' : 'text-slate-700'}`}>
              {parsedExplanation.outcome ||
                (excess > 0
                  ? `Claimed bill is ${fmtINR(requested)} against policy limit of ${fmtINR(
                    policyLimit || allowed
                  )}. ${fmtINR(allowed)} is allowed under policy and ${fmtINR(excess)} is excess.`
                  : `Total claimed amount of ${fmtINR(requested)} is fully within the policy limit of ${fmtINR(
                    policyLimit || allowed
                  )}.`)}
            </p>
          </div>

          {parsedExplanation.extraNotes.length > 0 && (
            <div className="space-y-1 pt-1">
              {parsedExplanation.extraNotes.map((n, i) => (
                <p key={i} className="text-xs text-slate-600">
                  {n}
                </p>
              ))}
            </div>
          )}
        </div>

        {appliedRules.length > 0 && (
          <div className="pt-1">
            <p className="text-xs font-bold text-slate-700 mb-1">Applied Rule(s)</p>
            <div className="space-y-1">
              {appliedRules.map((r, i) => (
                <p key={i} className="text-xs text-slate-600">
                  • <span className="font-semibold text-slate-800">{r.ruleName || 'Policy Rule'}</span>:{' '}
                  {cleanExplanationText(r.explanation)}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 7. Service Reports */}
      {serviceReportsList.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <h4 className="text-sm font-extrabold text-slate-900 mb-2">
            7. 📑 Service Reports ({serviceReportsList.length})
          </h4>
          <ProofGrid items={serviceReportsList} />
        </div>
      )}

      {/* 8. Claim Status & Approval Journey */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        <h4 className="text-sm font-extrabold text-slate-900">8. Claim Status & Approval Journey</h4>

        {/* Status Box */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-1">
          <DetailRow label="Claim Number" value={claim.claimNumber || claim.claimId || '—'} />
          <DetailRow
            label="Overall Status"
            value={
              isPaid
                ? 'PAID'
                : isAccountsStep1Approved
                  ? 'APPROVED BY ACCOUNTS (PAYMENT PENDING)'
                  : isRejected
                    ? 'REJECTED'
                    : statusUpper
            }
          />
          {showManagerCard && (
            <DetailRow
              label={showFinanceCard ? '1st Approval (Reporting Manager)' : 'Reporting Manager Approval'}
              value={
                mgrStatus === 'APPROVED'
                  ? `APPROVED${mgrName ? ` by ${mgrName}` : ''}`
                  : mgrStatus === 'REJECTED'
                    ? `REJECTED${mgrName ? ` by ${mgrName}` : ''}`
                    : `PENDING${mgrName ? ` (${mgrName})` : ''}`
              }
              valueClass={
                mgrStatus === 'APPROVED'
                  ? 'text-emerald-700 font-bold'
                  : mgrStatus === 'REJECTED'
                    ? 'text-rose-700 font-bold'
                    : 'text-amber-700 font-bold'
              }
            />
          )}
          {showFinanceCard && (
            <DetailRow
              label="2nd Approval (CFO / Finance Head)"
              value={
                finStatus === 'APPROVED'
                  ? `APPROVED${finName ? ` by ${finName}` : ''}`
                  : finStatus === 'REJECTED'
                    ? `REJECTED${finName ? ` by ${finName}` : ''}`
                    : finStatus === 'CANCELLED'
                      ? 'CANCELLED'
                      : finStatus === 'PENDING'
                        ? `PENDING${finName ? ` (${finName})` : ''}`
                        : 'AFTER 1ST APPROVAL'
              }
              valueClass={
                finStatus === 'APPROVED'
                  ? 'text-emerald-700 font-bold'
                  : finStatus === 'REJECTED' || finStatus === 'CANCELLED'
                    ? 'text-rose-700 font-bold'
                    : 'text-amber-700 font-bold'
              }
            />
          )}
          {statusUpper !== 'DRAFT' && (
            <DetailRow
              label="Accounts Admin Approval"
              value={
                isPaid
                  ? 'APPROVED & PAID'
                  : isAccountsStep1Approved
                    ? `APPROVED${accApprovedByName ? ` by ${accApprovedByName}` : ''} (Awaiting Payment)`
                    : isAccountsRejected
                      ? 'REJECTED BY ACCOUNTS'
                      : isRejected
                        ? 'CANCELLED'
                        : statusUpper === 'SUBMITTED'
                          ? 'PENDING ACCOUNTS APPROVAL'
                          : 'AFTER PRIOR APPROVALS'
              }
              valueClass={
                isPaid || isAccountsStep1Approved
                  ? 'text-emerald-700 font-bold'
                  : isRejected
                    ? 'text-rose-700 font-bold'
                    : 'text-amber-700 font-bold'
              }
            />
          )}
          <DetailRow
            label="Payment"
            value={isPaid ? `PAID (${fmtINR(paidAmount)})` : 'UNPAID'}
            valueClass={isPaid ? 'text-emerald-700 font-extrabold' : 'text-amber-700 font-bold'}
          />
          {isPaid && paidAt ? <DetailRow label="Paid Date" value={formatDateTime(paidAt)} /> : null}
          <DetailRow
            label="Applied Date & Time"
            value={formatDateTime(claim.submittedAt || claim.createdAt)}
          />
        </div>

        {/* Vertical Stepper: Claim Journey */}
        <div>
          <p className="text-xs font-extrabold text-slate-700 tracking-wider mb-3">Claim Journey</p>
          <div className="space-y-0">
            {journeySteps.map((step, idx) => {
              const isLast = idx === journeySteps.length - 1;
              const dotClass =
                step.tone === 'emerald'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : step.tone === 'rose'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-amber-500 text-white border-amber-500';
              const badgeClass =
                step.tone === 'emerald'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : step.tone === 'rose'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200';

              return (
                <div key={step.num} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-extrabold shrink-0 ${dotClass}`}
                    >
                      {step.num}
                    </div>
                    {!isLast && <div className="w-0.5 flex-1 bg-slate-200 my-1" />}
                  </div>
                  <div className={`flex-1 ${isLast ? 'pb-1' : 'pb-4'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-extrabold text-slate-900">{step.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}>
                        {step.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

