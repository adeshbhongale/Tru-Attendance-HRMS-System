const PDFDocument = require('pdfkit');
const axios = require('axios');
const { isManagementUser } = require('./expenseAccess');

/**
 * Check if the claimant is an authorized Management user (approval not applicable).
 */
function isClaimantManagement(claim) {
  const applicant = claim.submittedBy || {};
  const userObj = {
    role: applicant.role || claim.applicantRole,
    roleCode: applicant.roleCode || claim.applicantRoleCode,
    designation: applicant.designation || claim.applicantDesig,
    department: applicant.department || claim.applicantDept,
    category: applicant.category,
    responsibilityCodes: applicant.responsibilityCodes,
  };
  if (isManagementUser(applicant) || isManagementUser(userObj)) return true;
  if (claim.fullPayment?.requested) {
    if (claim.managerApproval?.kind === 'NONE' || !claim.managerApproval?.approver) {
      return true;
    }
  }
  return false;
}

/**
 * Extract structured employee limits for primary and accompanied claimants.
 */
function getEmployeeLimitsBreakdown(claim, rawEcList, days, isLodging) {
  let ecList = Array.isArray(rawEcList) ? [...rawEcList] : [];
  if (ecList.length <= 1 && Array.isArray(claim.accompaniedEmployees) && claim.accompaniedEmployees.length > 0) {
    claim.accompaniedEmployees.forEach((emp) => {
      ecList.push({ employee: emp, items: [] });
    });
  }

  const text = claim.plainExplanation || (ecList[0]?.items?.[0]?.plainExplanation) || (claim.entries?.[0]?.plainExplanation) || '';

  const parsedMap = new Map();
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const clean = rawLine.replace(/^\s*[•\-\*]\s*/, '').trim();
    if (!clean) continue;

    // Pattern 1: "Higher entitlement only = ₹1,200.00 (Aditya Pise)"
    const mHigher = clean.match(/Higher entitlement only\s*=\s*[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)\s*\(([^)]+)\)/i);
    if (mHigher) {
      const empNameKey = mHigher[2].trim().toLowerCase();
      const perDayVal = parseFloat(mHigher[1].replace(/,/g, ''));
      parsedMap.set(empNameKey, { perDay: perDayVal, tag: '(Higher)', totalStay: null, isActuals: false });
      continue;
    }

    // Pattern 2: "Aditya Pise: ₹1,200.00/day (Total: ₹2,400.00 for 2 days) (Higher)"
    // or "Aditya Pise: ₹2,000/day"
    // or "Aditya Pise: Actuals"
    const m = clean.match(/^([^:]+):\s*(?:[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)(?:\s*\/\s*day)?|Actuals)/i);
    if (m) {
      const empNameKey = m[1].trim().toLowerCase();
      const isActuals = !m[2] || /Actuals/i.test(clean);
      const perDayVal = isActuals ? 0 : parseFloat(m[2].replace(/,/g, ''));

      // Tag check: (Higher), (Lower), (Highest), (Middle), (Lowest)
      let tag = '';
      const mTag = clean.match(/\((Higher|Lower|Highest|Middle|Lowest)\)/i);
      if (mTag) {
        tag = `(${mTag[1].charAt(0).toUpperCase() + mTag[1].slice(1).toLowerCase()})`;
      }

      // Stay total check: (Total: ₹2,400.00 for 2 days)
      let totalStay = null;
      let stayDays = null;
      const mTot = clean.match(/\(Total:\s*[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)(?:\s*for\s*(\d+)\s*days?)?/i);
      if (mTot) {
        totalStay = parseFloat(mTot[1].replace(/,/g, ''));
        if (mTot[2]) stayDays = parseInt(mTot[2], 10);
      }

      parsedMap.set(empNameKey, { perDay: perDayVal, tag, totalStay, stayDays, isActuals });
    }
  }

  // Also check inline pattern if multi-entry: "Individual limits per day: Aditya Pise: 1,200.00/day, Rohan Sharma: 1,000.00/day"
  if (parsedMap.size === 0) {
    const inlineMatch = text.match(/Individual limits per day:?\s*([^\n]+?)(?:\s*\(Combined|\n\n|\n[A-Z]|$)/i);
    if (inlineMatch && inlineMatch[1]) {
      const parts = inlineMatch[1].split(/\s*,\s*(?=[^,]+:)/);
      for (const p of parts) {
        const cleanP = p.trim();
        const m = cleanP.match(/^([^:]+):\s*(?:[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)(?:\s*\/\s*day)?|Actuals)/i);
        if (m) {
          const empNameKey = m[1].trim().toLowerCase();
          const isActuals = !m[2] || /Actuals/i.test(cleanP);
          const perDayVal = isActuals ? 0 : parseFloat(m[2].replace(/,/g, ''));
          let tag = '';
          const mTag = cleanP.match(/\((Higher|Lower|Highest|Middle|Lowest)\)/i);
          if (mTag) tag = `(${mTag[1].charAt(0).toUpperCase() + mTag[1].slice(1).toLowerCase()})`;
          parsedMap.set(empNameKey, { perDay: perDayVal, tag, totalStay: null, stayDays: null, isActuals });
        }
      }
    }
  }

  const grandLimit = Number(claim.grandPolicyLimit || claim.policyLimit || 0);

  return ecList.map((ec, idx) => {
    const isPrimary = idx === 0;
    const emp = ec.employee || {};
    const empUser = (typeof emp.employeeId === 'object' && emp.employeeId !== null) ? emp.employeeId : {};
    const name = emp.name || empUser.name || (isPrimary ? (claim.submittedByName || claim.submittedBy?.name || 'Primary Claimant') : `Accompanied Employee #${idx + 1}`);
    const code = emp.employeeIdCode || empUser.employeeIdCode || '';
    const dept = emp.department || empUser.department || '';
    const desig = emp.designation || empUser.designation || emp.levelName || emp.role || emp.gradeCode || '';
    const mobile = emp.mobile || emp.phone || empUser.mobile || '';

    const nameKey = name.trim().toLowerCase();
    let parsedInfo = parsedMap.get(nameKey);
    if (!parsedInfo) {
      for (const [k, v] of parsedMap.entries()) {
        if (nameKey.includes(k) || k.includes(nameKey)) {
          parsedInfo = v;
          break;
        }
      }
    }

    const targetItem = ec.items?.find((item) => {
      const t = String(item?.expenseType || '').toUpperCase();
      return isLodging ? (t === 'LODGING' || t === 'LODGING_EXPENSE') : (t === 'FOOD' || t === 'FOOD_EXPENSE');
    }) || ec.items?.[0] || {};

    const breakdown = targetItem.calculationBreakdown || {};
    const src = breakdown.sourceValues || {};
    const isRelativeStay = isLodging && String(claim.stayType || breakdown.stayType || '').toUpperCase() === 'WITH_RELATIVE';

    let perDay = (isRelativeStay && targetItem.perDayLimit !== undefined && targetItem.perDayLimit !== null)
      ? Number(targetItem.perDayLimit)
      : ((parsedInfo && parsedInfo.perDay > 0) ? parsedInfo.perDay : 0);
    let tag = (parsedInfo && parsedInfo.tag) ? parsedInfo.tag : '';

    if (!perDay && !(isRelativeStay && targetItem.perDayLimit === 0)) {
      perDay = Number(
        targetItem.perDayLimit ||
        src.entitlementPerDay ||
        src.dailyEntitlement ||
        src.baseEntitlement ||
        src.capPerEmployee ||
        breakdown.dailyCap ||
        0
      );
    }

    if (!perDay && (targetItem.policyLimit || ec.policyLimitTotal || ec.policyLimit)) {
      const itemLimit = Number(targetItem.policyLimit || ec.policyLimitTotal || ec.policyLimit || 0);
      if (isLodging && days > 0 && itemLimit > 0) {
        perDay = Math.round(itemLimit / days);
      } else if (itemLimit > 0) {
        perDay = itemLimit;
      }
    }

    if (!perDay && (src.totalEntitlement || src.totalBaseEntitlement)) {
      const tot = Number(src.totalEntitlement || src.totalBaseEntitlement || 0);
      if (tot > 0) perDay = Math.round(tot / (days || 1));
    }

    if (!perDay && (src.higherEntitlement || src.lowerEntitlement)) {
      if (ecList.length === 2) {
        const isFirstHigher = Number(ecList[0]?.employee?.levelNumber || 99) <= Number(ecList[1]?.employee?.levelNumber || 99);
        const myEnt = (idx === 0 ? isFirstHigher : !isFirstHigher)
          ? (src.higherEntitlement || src.lowerEntitlement)
          : (src.lowerEntitlement || src.higherEntitlement);
        perDay = Number(myEnt || 0);
        tag = (idx === 0 ? isFirstHigher : !isFirstHigher) ? '(Higher)' : '(Lower)';
      } else {
        perDay = Number(src.higherEntitlement || src.lowerEntitlement || 0);
      }
    }

    if (!perDay && Array.isArray(breakdown.steps)) {
      for (const s of breakdown.steps) {
        const m = String(s).match(/[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)\s*\/\s*day/i);
        if (m) {
          perDay = parseFloat(m[1].replace(/,/g, ''));
          break;
        }
      }
    }

    if (!perDay && grandLimit > 0) {
      perDay = Math.round(grandLimit / (ecList.length || 1) / (isLodging ? (days || 1) : 1));
    }

    let dailyLimitStr = '';
    if (perDay > 0 || isRelativeStay) {
      dailyLimitStr = (tag ? `Rs. ${formatINR(perDay)}/day ${tag}` : `Rs. ${formatINR(perDay)}/day`).replace(/\s+/g, ' ').trim();
    } else if (parsedInfo?.isActuals) {
      dailyLimitStr = 'Actuals (No limit)';
    } else {
      dailyLimitStr = 'Actuals';
    }

    let totalLimitStr = '';
    if (isLodging) {
      const stayAmt = isRelativeStay && (targetItem.policyLimit !== undefined || ec.policyLimitTotal !== undefined)
        ? Number(targetItem.policyLimit ?? ec.policyLimitTotal ?? (perDay * days))
        : ((parsedInfo && parsedInfo.totalStay > 0)
          ? parsedInfo.totalStay
          : (perDay > 0 && days > 0 ? perDay * days : (Number(targetItem.policyLimit || ec.policyLimitTotal || 0))));

      let effectiveStayDays = (parsedInfo && parsedInfo.stayDays > 0) ? parsedInfo.stayDays : days;
      if (stayAmt > 0 && perDay > 0) {
        const derived = Math.round(stayAmt / perDay);
        if (derived > 0) effectiveStayDays = derived;
      }

      if ((stayAmt > 0 || isRelativeStay) && effectiveStayDays > 0) {
        totalLimitStr = `Rs. ${formatINR(stayAmt)} (${effectiveStayDays} ${effectiveStayDays > 1 ? 'Days' : 'Day'})`;
      } else if (stayAmt > 0 || isRelativeStay) {
        totalLimitStr = `Rs. ${formatINR(stayAmt)}`;
      } else {
        totalLimitStr = 'Actuals';
      }
    }

    return {
      index: idx + 1,
      isPrimary,
      roleLabel: isPrimary ? '#1 Primary Filer' : `#${idx + 1} Accompanied`,
      name,
      code,
      dept,
      desig,
      mobile,
      perDay,
      tag,
      dailyLimitStr,
      totalLimitStr,
    };
  });
}

/**
 * Format number into Indian numbering format without currency symbol
 * (avoid font-encoding errors in standard PDF fonts).
 */
const formatINR = (val) => {
  const num = Number(val || 0);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch (_) {
    return String(dateStr).slice(0, 10);
  }
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).slice(0, 16);
    return (
      d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) +
      ', ' +
      d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    );
  } catch (_) {
    return String(dateStr).slice(0, 16);
  }
};

/**
 * Render standard Indian Rupee vector glyph (₹) before numeric currency values.
 */
function drawRupee(doc, x, y, size = 8, color = '#0f172a') {
  doc.save();
  const s = size / 24;
  doc.lineWidth(1.8 * s).lineCap('round').lineJoin('round').strokeColor(color);
  doc.moveTo(x + 5.5 * s, y + 4 * s).lineTo(x + 18.5 * s, y + 4 * s).stroke();
  doc.moveTo(x + 5.5 * s, y + 9.5 * s).lineTo(x + 18.5 * s, y + 9.5 * s).stroke();
  doc.moveTo(x + 9 * s, y + 4 * s).lineTo(x + 9 * s, y + 14 * s).stroke();
  doc.moveTo(x + 9 * s, y + 4 * s).bezierCurveTo(x + 17.5 * s, y + 4 * s, x + 17.5 * s, y + 14 * s, x + 9 * s, y + 14 * s).stroke();
  doc.moveTo(x + 9 * s, y + 14 * s).lineTo(x + 17.5 * s, y + 21.5 * s).stroke();
  doc.restore();
}

/**
 * Draw numeric amount prefixed with Indian Rupee vector icon, right/center/left aligned.
 */
function drawAmountWithRupee(doc, x, y, width, amount, color = '#0f172a', align = 'right', fontSize = 7.5) {
  doc.fontSize(fontSize).font('Helvetica-Bold');
  const numStr = formatINR(amount);
  const textW = doc.widthOfString(numStr);
  const iconSize = fontSize * 0.9;
  const iconGap = 2;
  const totalW = iconSize + iconGap + textW;

  const startX = align === 'right' ? x + width - totalW : (align === 'center' ? x + (width - totalW) / 2 : x);
  drawRupee(doc, startX, y + 1, iconSize, color);
  doc.fillColor(color).text(numStr, startX + iconSize + iconGap, y, { lineBreak: false });
}

const getStatusBadge = (status, paymentStatus) => {
  const s = String(status || '').toUpperCase();
  const ps = String(paymentStatus || '').toUpperCase();

  if (s === 'PAID' || ps === 'PAID' || s === 'DISBURSED' || ps === 'DISBURSED' || s === 'SETTLED') {
    return { text: 'PAID', bg: '#059669', textColor: '#ffffff' };
  }
  if (s === 'REJECTED' || ps === 'REJECTED' || s === 'HR_REJECTED' || s === 'ACCOUNTS_REJECTED') {
    return { text: 'REJECTED', bg: '#dc2626', textColor: '#ffffff' };
  }
  if (s === 'DRAFT' || s === 'RETURNED') {
    return { text: 'DRAFT', bg: '#64748b', textColor: '#ffffff' };
  }
  if (s === 'APPROVAL_PENDING') {
    return { text: 'AWAITING APPROVAL', bg: '#7c3aed', textColor: '#ffffff' };
  }
  return { text: 'PENDING', bg: '#d97706', textColor: '#ffffff' };
};

/**
 * Fetch image buffer from remote URL with Cloudinary optimization and fallback detection.
 */
async function fetchProofImage(url) {
  if (!url || typeof url !== 'string') return { status: 'NO_URL' };
  try {
    let fetchUrl = url.trim();
    if (fetchUrl.includes('res.cloudinary.com') && fetchUrl.includes('/image/upload/')) {
      if (!fetchUrl.includes('/f_jpg') && !fetchUrl.includes('/w_')) {
        fetchUrl = fetchUrl.replace('/image/upload/', '/image/upload/f_jpg,w_900,c_limit,q_auto/');
      }
    }
    const resp = await axios.get(fetchUrl, {
      responseType: 'arraybuffer',
      timeout: 7000,
      headers: {
        'Accept': 'image/jpeg,image/png,image/*,*/*',
      },
    });

    const buf = Buffer.from(resp.data);
    const isJpeg = buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8;
    const isPng = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    const isPdf = buf.length > 4 && buf.slice(0, 4).toString('ascii') === '%PDF';

    if (isJpeg || isPng) {
      return { status: 'IMAGE', buffer: buf, format: isJpeg ? 'jpeg' : 'png' };
    }
    if (isPdf) {
      return { status: 'PDF', buffer: buf };
    }
    return { status: 'OTHER', buffer: buf };
  } catch (err) {
    return { status: 'ERROR', error: err.message };
  }
}

/**
 * Generate a professional expense claim PDF voucher and pipe to `res`.
 * Designed with dynamic sizing to prevent any text overlaps or word cutoffs.
 * Automatically embeds all supporting proof photos and document receipts directly inside the same PDF.
 * Signatures are omitted as required.
 */
async function generateClaimPdf(claim, res) {
  // ─────────────────────────────────────────────────────────────
  // GATHER ALL ATTACHED PROOFS & FETCH BUFFERS IN PARALLEL
  // ─────────────────────────────────────────────────────────────
  const allProofs = [];
  const seenProofKeys = new Set();

  const addProof = (item) => {
    if (!item) return;
    const key = (item.url || item.name || '').trim();
    if (!key || seenProofKeys.has(key)) return;
    seenProofKeys.add(key);
    allProofs.push(item);
  };

  const rawEntriesList = Array.isArray(claim.entries) ? claim.entries : [];
  const rawEcList = Array.isArray(claim.employeeClaims) ? [...claim.employeeClaims] : [];
  if (rawEcList.length <= 1 && Array.isArray(claim.accompaniedEmployees) && claim.accompaniedEmployees.length > 0) {
    claim.accompaniedEmployees.forEach((emp) => {
      rawEcList.push({ employee: emp, items: [] });
    });
  }

  // Conveyance & attachment proofs from entries
  rawEntriesList.forEach((e) => {
    const vLabel = e.vehicle ? `Vehicle: ${e.vehicle}` : 'Vehicle verification';
    (Array.isArray(e.numberPlatePhotos) ? e.numberPlatePhotos : []).forEach((p) => {
      addProof({
        category: 'CONVEYANCE_VEHICLE',
        tag: 'VEHICLE PHOTO',
        tagColor: '#0284c7',
        title: `Vehicle Photo (${e.vehicle || 'Vehicle'})`,
        subtitle: p.name ? `${p.name} • ${vLabel}` : vLabel,
        url: p.url,
        name: p.name,
        size: p.size,
      });
    });
    (Array.isArray(e.startKmPhotos) ? e.startKmPhotos : []).forEach((p) => {
      const odo = e.startKm !== undefined && e.startKm !== null ? `${e.startKm} km` : 'Start Reading';
      addProof({
        category: 'CONVEYANCE_START',
        tag: 'START KM ODOMETER',
        tagColor: '#d97706',
        title: `Start KM Odometer Photo (${odo})`,
        subtitle: p.name ? `${p.name} • Start Odometer` : 'Odometer at journey start',
        url: p.url,
        name: p.name,
        size: p.size,
      });
    });
    (Array.isArray(e.endKmPhotos) ? e.endKmPhotos : []).forEach((p) => {
      const odo = e.endKm !== undefined && e.endKm !== null ? `${e.endKm} km` : 'End Reading';
      const dist = e.distanceKm ? ` (${e.distanceKm} km travelled)` : '';
      addProof({
        category: 'CONVEYANCE_END',
        tag: 'END KM ODOMETER',
        tagColor: '#059669',
        title: `End KM Odometer Photo (${odo})`,
        subtitle: p.name ? `${p.name} • End Odometer${dist}` : `Odometer at journey end${dist}`,
        url: p.url,
        name: p.name,
        size: p.size,
      });
    });
    const atts = Array.isArray(e.receipts) ? e.receipts : (Array.isArray(e.attachments) ? e.attachments : []);
    atts.forEach((a, aIdx) => {
      addProof({
        category: 'RECEIPT',
        tag: 'BILL / RECEIPT',
        tagColor: '#4f46e5',
        title: `Receipt #${aIdx + 1} (${(e.expenseType || 'Expense').toUpperCase()})`,
        subtitle: a.name ? `${a.name}${a.size ? ` • ${Math.round(a.size / 1024)} KB` : ''}` : 'Verified receipt document',
        url: a.url,
        name: a.name,
        size: a.size,
      });
    });
    (Array.isArray(e.serviceReports) ? e.serviceReports : []).forEach((sr, srIdx) => {
      addProof({
        category: 'SERVICE_REPORT',
        tag: 'SERVICE REPORT',
        tagColor: '#7c3aed',
        title: `Service Report #${srIdx + 1} (${(e.expenseType || 'Conveyance').toUpperCase()})`,
        subtitle: sr.name ? `${sr.name}${sr.size ? ` • ${Math.round(sr.size / 1024)} KB` : ''}` : 'Visit service report document',
        url: sr.url,
        name: sr.name,
        size: sr.size,
      });
    });
  });

  // Check ecList items for any conveyance photos or service reports not captured in entries
  rawEcList.forEach((ec) => {
    (ec.items || []).forEach((it) => {
      (Array.isArray(it.numberPlatePhotos) ? it.numberPlatePhotos : []).forEach((p) => {
        addProof({
          category: 'CONVEYANCE_VEHICLE',
          tag: 'VEHICLE PHOTO',
          tagColor: '#0284c7',
          title: `Vehicle Photo (${it.vehicle || 'Vehicle'})`,
          subtitle: p.name || 'Vehicle verification',
          url: p.url,
          name: p.name,
          size: p.size,
        });
      });
      (Array.isArray(it.startKmPhotos) ? it.startKmPhotos : []).forEach((p) => {
        addProof({
          category: 'CONVEYANCE_START',
          tag: 'START KM ODOMETER',
          tagColor: '#d97706',
          title: 'Start KM Odometer Photo',
          subtitle: p.name || 'Start odometer',
          url: p.url,
          name: p.name,
          size: p.size,
        });
      });
      (Array.isArray(it.endKmPhotos) ? it.endKmPhotos : []).forEach((p) => {
        addProof({
          category: 'CONVEYANCE_END',
          tag: 'END KM ODOMETER',
          tagColor: '#059669',
          title: 'End KM Odometer Photo',
          subtitle: p.name || 'End odometer',
          url: p.url,
          name: p.name,
          size: p.size,
        });
      });
      (Array.isArray(it.serviceReports) ? it.serviceReports : []).forEach((sr, srIdx) => {
        addProof({
          category: 'SERVICE_REPORT',
          tag: 'SERVICE REPORT',
          tagColor: '#7c3aed',
          title: `Service Report #${srIdx + 1} (${(it.expenseType || 'Conveyance').toUpperCase()})`,
          subtitle: sr.name ? `${sr.name}${sr.size ? ` • ${Math.round(sr.size / 1024)} KB` : ''}` : 'Visit service report document',
          url: sr.url,
          name: sr.name,
          size: sr.size,
        });
      });
      (Array.isArray(it.attachments) ? it.attachments : []).forEach((a, aIdx) => {
        addProof({
          category: 'RECEIPT',
          tag: 'BILL / RECEIPT',
          tagColor: '#4f46e5',
          title: `Receipt #${aIdx + 1} (${(it.expenseType || 'Expense').toUpperCase()})`,
          subtitle: a.name ? `${a.name}${a.size ? ` • ${Math.round(a.size / 1024)} KB` : ''}` : 'Verified receipt document',
          url: a.url,
          name: a.name,
          size: a.size,
        });
      });
    });
  });

  // Direct claim receipts
  (Array.isArray(claim.receipts) ? claim.receipts : []).forEach((r, rIdx) => {
    addProof({
      category: 'RECEIPT',
      tag: 'BILL / RECEIPT',
      tagColor: '#4f46e5',
      title: `Bill Receipt #${rIdx + 1}`,
      subtitle: r.name ? `${r.name}${r.size ? ` • ${Math.round(r.size / 1024)} KB` : ''}` : 'Verified receipt document',
      url: r.url,
      name: r.name,
      size: r.size,
    });
  });

  // Direct service reports
  (Array.isArray(claim.serviceReports) ? claim.serviceReports : []).forEach((sr, srIdx) => {
    addProof({
      category: 'SERVICE_REPORT',
      tag: 'SERVICE REPORT',
      tagColor: '#7c3aed',
      title: `Customer Service Report #${srIdx + 1}`,
      subtitle: sr.name ? `${sr.name}${sr.size ? ` • ${Math.round(sr.size / 1024)} KB` : ''}` : 'Customer signed service report',
      url: sr.url,
      name: sr.name,
      size: sr.size,
    });
  });

  // Full payment proofs
  const fpProofs = Array.isArray(claim.fullPayment?.proofs) ? claim.fullPayment.proofs : [];
  fpProofs.forEach((p, pIdx) => {
    addProof({
      category: 'FULL_PAYMENT',
      tag: 'FULL PAYMENT PROOF',
      tagColor: '#dc2626',
      title: `Full Payment Justification Proof #${pIdx + 1}`,
      subtitle: p.name || 'Special management approval document',
      url: p.url,
      name: p.name,
      size: p.size,
    });
  });

  // Fetch images in parallel
  const fetchedProofs = await Promise.all(
    allProofs.map(async (proof) => {
      const imgRes = await fetchProofImage(proof.url);
      return { ...proof, ...imgRes };
    })
  );
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    bufferPages: true,
    compress: false,
    info: {
      Title: `Expense Claim - ${claim.claimNumber || claim._id}`,
      Author: 'Trucode ERP HRMS',
      Subject: 'Expense Reimbursement Claim Voucher',
      CreationDate: new Date(),
    },
  });

  doc.pipe(res);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 36;
  const contentWidth = pageWidth - margin * 2; // 523.28pt

  const ensureSpace = (neededHeight) => {
    if (doc.y + neededHeight > pageHeight - margin - 25) {
      doc.addPage();
    }
  };

  // ─────────────────────────────────────────────────────────────
  // 1. TOP HEADER BANNER
  // ─────────────────────────────────────────────────────────────
  const headerHeight = 72;
  const startX = margin;
  const startY = margin;

  // Background banner
  doc.rect(startX, startY, contentWidth, headerHeight).fill('#0f172a');

  // Company Name & Subtitle
  const companyName = String(claim.companyId?.name || claim.companyName || 'TRUCODE ERP HRMS').toUpperCase();
  doc
    .fillColor('#ffffff')
    .fontSize(13)
    .font('Helvetica-Bold')
    .text(companyName, startX + 16, startY + 12, { width: 330, ellipsis: true });

  doc
    .fillColor('#94a3b8')
    .fontSize(8.5)
    .font('Helvetica')
    .text('EXPENSE REIMBURSEMENT CLAIM VOUCHER', startX + 16, startY + 32, { width: 330 });

  doc
    .fillColor('#cbd5e1')
    .fontSize(8)
    .font('Helvetica')
    .text(`Voucher ID: ${claim.claimNumber || claim.claimId || claim._id}`, startX + 16, startY + 48, { width: 330, ellipsis: true });

  // Status Badge on Right
  const badge = getStatusBadge(claim.status, claim.paymentStatus);
  const badgeWidth = 120;
  const badgeHeight = 22;
  const badgeX = startX + contentWidth - badgeWidth - 16;
  const badgeY = startY + 14;

  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fill(badge.bg);
  doc
    .fillColor(badge.textColor)
    .fontSize(9)
    .font('Helvetica-Bold')
    .text(badge.text, badgeX, badgeY + 6, { width: badgeWidth, align: 'center' });

  // Applied Date below badge
  const appliedDateStr = formatDateTime(claim.submittedAt || claim.createdAt);
  doc
    .fillColor('#94a3b8')
    .fontSize(7.5)
    .font('Helvetica')
    .text(`Applied: ${appliedDateStr}`, badgeX - 40, startY + 46, { width: badgeWidth + 40, align: 'right' });

  doc.y = startY + headerHeight + 12;

  // ─────────────────────────────────────────────────────────────
  // 2. FINANCIAL SUMMARY METRIC BOXES
  // ─────────────────────────────────────────────────────────────
  const grandReq = claim.grandRequested !== undefined ? claim.grandRequested : (claim.requestedAmount || claim.amount || 0);
  const grandAllow = claim.grandAllowed !== undefined ? claim.grandAllowed : (claim.allowedAmount !== undefined ? claim.allowedAmount : grandReq);
  const grandExc = claim.grandExcess !== undefined ? claim.grandExcess : (claim.excessAmount || 0);
  const payAmt = claim.payableAmount !== undefined ? claim.payableAmount : grandAllow;
  const isPaid = ['PAID', 'DISBURSED', 'SETTLED'].includes(String(claim.status || '').toUpperCase()) || ['PAID', 'DISBURSED'].includes(String(claim.paymentStatus || '').toUpperCase());
  const paidAmt = claim.paidAmount || claim.disbursement?.amount || (isPaid ? payAmt : 0);

  const boxes = [
    { label: 'TOTAL CLAIMED', value: formatINR(grandReq), color: '#0f172a', bg: '#f8fafc' },
    { label: 'TOTAL ALLOWED', value: formatINR(grandAllow), color: '#059669', bg: '#f0fdf4' },
    { label: 'EXCESS AMOUNT', value: formatINR(grandExc), color: grandExc > 0 ? '#dc2626' : '#64748b', bg: grandExc > 0 ? '#fff1f2' : '#f8fafc' },
    { label: isPaid ? 'PAID AMOUNT' : 'NET PAYABLE', value: formatINR(isPaid ? paidAmt : payAmt), color: '#4338ca', bg: '#eef2ff' },
  ];

  const boxGap = 8;
  const boxWidth = (contentWidth - boxGap * (boxes.length - 1)) / boxes.length;
  const boxHeight = 44;
  const metricsY = doc.y;

  boxes.forEach((b, idx) => {
    const bx = startX + idx * (boxWidth + boxGap);
    doc.roundedRect(bx, metricsY, boxWidth, boxHeight, 6).fillAndStroke(b.bg, '#e2e8f0');
    doc
      .fillColor('#64748b')
      .fontSize(7)
      .font('Helvetica-Bold')
      .text(b.label, bx, metricsY + 8, { width: boxWidth, align: 'center' });

    doc.fontSize(10).font('Helvetica-Bold');
    const textWidth = doc.widthOfString(b.value);
    const iconSize = 9;
    const iconGap = 2;
    const totalW = iconSize + iconGap + textWidth;
    const contentStartX = bx + (boxWidth - totalW) / 2;

    drawRupee(doc, contentStartX, metricsY + 23, iconSize, b.color);
    doc
      .fillColor(b.color)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(b.value, contentStartX + iconSize + iconGap, metricsY + 22, { lineBreak: false });
  });

  doc.y = metricsY + boxHeight + 12;

  // ─────────────────────────────────────────────────────────────
  // 3. APPLICANT & CLAIM DETAILS (DYNAMIC DUAL-CARD GRID)
  // ─────────────────────────────────────────────────────────────
  const applicant = claim.submittedBy || {};
  const applicantName = applicant.name || claim.submittedByName || 'Employee';
  const applicantCode = applicant.employeeIdCode || 'N/A';
  const applicantDept = applicant.department || 'N/A';
  const applicantDesig = applicant.designation || 'N/A';
  const applicantMobile = applicant.mobile || applicant.phone || applicant.mobileNumber || claim.applicantMobile || '';
  const applicantEmail = applicant.email || claim.applicantEmail || '';
  const contactParts = [];
  if (applicantMobile) contactParts.push(applicantMobile);
  if (applicantEmail) contactParts.push(applicantEmail);
  const applicantContact = contactParts.length > 0 ? contactParts.join(' • ') : 'N/A';

  const claimType = (claim.claimType || claim.expenseType || 'EXPENSE').toUpperCase();
  const trip = claim.trip || {};
  const claimMode = (claim.claimMode || (claim.fromDate ? 'LODGING' : 'NORMAL')).toUpperCase();
  const isLodging = claimMode === 'LODGING';

  let dateInfo = 'N/A';
  if (isLodging && claim.fromDate && claim.toDate) {
    const nights = claim.numberOfNights || 1;
    dateInfo = `${formatDate(claim.fromDate)} to ${formatDate(claim.toDate)} (${nights} ${nights > 1 ? 'Nights' : 'Night'})`;
  } else if (claim.claimDate || claim.expenseDate || claim.date) {
    dateInfo = formatDate(claim.claimDate || claim.expenseDate || claim.date);
  }

  const colWidth = (contentWidth - 12) / 2;
  const cardY = doc.y;

  const leftFields = [
    ['Full Name:', applicantName],
    ['Employee ID:', applicantCode],
    ['Department:', applicantDept],
    ['Designation:', applicantDesig],
    ['Mobile / Contact:', applicantContact],
  ];

  const resolvedCustomer = (trip.customerName && trip.customerName.trim()) ||
    (claim.customerName && claim.customerName.trim()) ||
    (rawEcList[0]?.items?.[0]?.customerName && rawEcList[0].items[0].customerName.trim()) ||
    (Array.isArray(claim.entries) && claim.entries[0]?.customerName && claim.entries[0].customerName.trim()) ||
    'N/A';

  const resolvedPurpose = (trip.purpose && trip.purpose.trim()) ||
    (claim.remark && claim.remark.trim()) ||
    (claim.purpose && claim.purpose.trim()) ||
    (rawEcList[0]?.items?.[0]?.description && rawEcList[0].items[0].description.trim()) ||
    (Array.isArray(claim.entries) && claim.entries[0]?.description && claim.entries[0].description.trim()) ||
    'N/A';

  const stayTypeRaw = isLodging ? String(claim.stayType || rawEcList[0]?.items?.[0]?.calculationBreakdown?.stayType || '').toUpperCase() : '';
  const relStayPct = claim.relativeStayPercent ?? rawEcList[0]?.items?.[0]?.calculationBreakdown?.relativeStayPercent;
  const stayTypeDisplay = stayTypeRaw === 'WITH_RELATIVE'
    ? `With Relative${relStayPct !== undefined && relStayPct !== null ? ` (${relStayPct}% Allowance)` : ''}`
    : (stayTypeRaw === 'IN_HOTEL' ? 'In Hotel' : '');

  const rightFields = [
    ['Expense Type:', `${claimType} (${claimMode})`],
    ...(stayTypeDisplay ? [['Stay Type:', stayTypeDisplay]] : []),
    ['Dates / Period:', dateInfo],
    ['Destination:', trip.destination ? `${trip.destination} (Class ${trip.destinationClass || 'C'})` : (claim.city || 'Local / In-City')],
    ['Customer:', resolvedCustomer],
    ['Purpose:', resolvedPurpose],
  ];

  // Calculate required heights dynamically to prevent any text clipping or box overflowing
  const valueWidth = colWidth - 92;
  doc.fontSize(8).font('Helvetica-Bold');

  let leftRowsHeight = 0;
  const leftMeasurements = leftFields.map(([lbl, val]) => {
    const vH = Math.max(12, doc.heightOfString(String(val), { width: valueWidth }));
    const rH = Math.min(26, vH + 3);
    leftRowsHeight += rH;
    return { lbl, val: String(val), rH };
  });

  let rightRowsHeight = 0;
  const rightMeasurements = rightFields.map(([lbl, val]) => {
    const vH = Math.max(12, doc.heightOfString(String(val), { width: valueWidth }));
    const rH = Math.min(26, vH + 3);
    rightRowsHeight += rH;
    return { lbl, val: String(val), rH };
  });

  const cardContentHeight = Math.max(leftRowsHeight, rightRowsHeight);
  const cardTotalHeight = 24 + cardContentHeight + 10;

  ensureSpace(cardTotalHeight);

  // Left Box: Applicant Info
  doc.roundedRect(startX, cardY, colWidth, cardTotalHeight, 6).fillAndStroke('#ffffff', '#e2e8f0');
  doc.rect(startX, cardY, colWidth, 22).fill('#f1f5f9');
  doc
    .fillColor('#334155')
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('EMPLOYEE / CLAIMANT INFORMATION', startX + 10, cardY + 7);

  let ly = cardY + 28;
  leftMeasurements.forEach(({ lbl, val, rH }) => {
    doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(lbl, startX + 10, ly, { width: 72 });
    doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold').text(val, startX + 84, ly, { width: valueWidth, ellipsis: true });
    ly += rH;
  });

  // Right Box: Claim & Trip Details
  const rightX = startX + colWidth + 12;
  doc.roundedRect(rightX, cardY, colWidth, cardTotalHeight, 6).fillAndStroke('#ffffff', '#e2e8f0');
  doc.rect(rightX, cardY, colWidth, 22).fill('#f1f5f9');
  doc
    .fillColor('#334155')
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('CLAIM & JOURNEY INFORMATION', rightX + 10, cardY + 7);

  let ry = cardY + 28;
  rightMeasurements.forEach(({ lbl, val, rH }) => {
    doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(lbl, rightX + 10, ry, { width: 72 });
    doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold').text(val, rightX + 84, ry, { width: valueWidth, ellipsis: true });
    ry += rH;
  });

  doc.y = cardY + cardTotalHeight + 10;

  // ─────────────────────────────────────────────────────────────
  // 3B. ACCOMPANIED / CO-CLAIMANT EMPLOYEES & INDIVIDUAL LIMITS
  // ─────────────────────────────────────────────────────────────
  const hasAccompanied = rawEcList.length > 1 || Number(claim.numberOfEmployees || claim.employeeCount || 1) > 1 || (Array.isArray(claim.accompaniedEmployees) && claim.accompaniedEmployees.length > 0);

  if (hasAccompanied) {
    let days = Number(claim.numberOfDays || claim.days || claim.trip?.days || claim.numberOfNights || 0);
    if (!days && isLodging && claim.fromDate && claim.toDate) {
      try {
        const d1 = new Date(claim.fromDate);
        const d2 = new Date(claim.toDate);
        const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diff > 0) days = diff;
      } catch (_) {}
    }
    if (!days) days = 1;

    const empBreakdown = getEmployeeLimitsBreakdown(claim, rawEcList, days, isLodging);
    const rowH = 22;
    const headerH = 22;
    const colHeadH = 18;
    const accCardH = headerH + colHeadH + (empBreakdown.length * rowH) + 6;

    ensureSpace(accCardH + 10);
    const accY = doc.y;

    // Card border & background
    doc.roundedRect(startX, accY, contentWidth, accCardH, 6).fillAndStroke('#ffffff', '#cbd5e1');

    // Title banner
    doc.rect(startX, accY, contentWidth, headerH).fill('#f8fafc');
    doc
      .fillColor('#1e293b')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(
        `ACCOMPANIED EMPLOYEES & INDIVIDUAL POLICY LIMITS (${empBreakdown.length} EMPLOYEES)`,
        startX + 10,
        accY + 7
      );

    // Column headers
    const colHeadY = accY + headerH;
    doc.rect(startX, colHeadY, contentWidth, colHeadH).fill('#f1f5f9');

    // Total table width: 507 pt, leaving symmetrical 8 pt padding on left and right inside contentWidth (523.28 pt)
    const accCols = isLodging
      ? [
          { label: 'ROLE / SL', w: 65, align: 'left' },
          { label: 'EMPLOYEE NAME', w: 128, align: 'left' },
          { label: 'DEPARTMENT / DESIGNATION', w: 112, align: 'left' },
          { label: 'DAILY LIMIT', w: 101, align: 'right' },
          { label: 'STAY LIMIT', w: 101, align: 'right' },
        ]
      : [
          { label: 'ROLE / SL', w: 75, align: 'left' },
          { label: 'EMPLOYEE NAME', w: 150, align: 'left' },
          { label: 'DEPARTMENT / DESIGNATION', w: 142, align: 'left' },
          { label: 'INDIVIDUAL DAILY LIMIT', w: 140, align: 'right' },
        ];

    let hx = startX + 8;
    doc.fillColor('#475569').fontSize(7).font('Helvetica-Bold');
    accCols.forEach((c) => {
      doc.text(c.label, hx + (c.align === 'right' ? 0 : 2), colHeadY + 5, { width: c.w - 4, align: c.align });
      hx += c.w;
    });

    // Rows
    let curRowY = colHeadY + colHeadH;
    empBreakdown.forEach((emp, eIdx) => {
      const isEven = eIdx % 2 === 0;
      if (!isEven) {
        doc.rect(startX, curRowY, contentWidth, rowH).fill('#f8fafc');
      }
      doc.rect(startX, curRowY + rowH - 1, contentWidth, 1).fill('#f1f5f9');

      let rx = startX + 8;
      // Col 1: Role
      const roleColor = emp.isPrimary ? '#4338ca' : '#64748b';
      doc.fillColor(roleColor).fontSize(7).font('Helvetica-Bold');
      doc.text(emp.roleLabel, rx + 2, curRowY + 6, { width: accCols[0].w - 4, ellipsis: true });
      rx += accCols[0].w;

      // Col 2: Name
      const nameText = emp.name;
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold');
      doc.text(nameText, rx + 2, curRowY + 6, { width: accCols[1].w - 4, ellipsis: true });
      rx += accCols[1].w;

      // Col 3: Dept / Desig
      const deptDesig = [emp.dept, emp.desig].filter(Boolean).join(' • ') || 'N/A';
      doc.fillColor('#475569').fontSize(7).font('Helvetica');
      doc.text(deptDesig, rx + 2, curRowY + 6, { width: accCols[2].w - 4, ellipsis: true });
      rx += accCols[2].w;

      // Col 4: Daily Limit
      doc.fillColor('#059669').fontSize(7.5).font('Helvetica-Bold');
      doc.text(emp.dailyLimitStr, rx, curRowY + 6, { width: accCols[3].w - 4, align: 'right', ellipsis: true });
      rx += accCols[3].w;

      // Col 5: Total Limit (Lodging only)
      if (isLodging) {
        doc.fillColor('#4338ca').fontSize(7.5).font('Helvetica-Bold');
        doc.text(emp.totalLimitStr || 'N/A', rx, curRowY + 6, { width: accCols[4].w - 4, align: 'right', ellipsis: true });
      }

      curRowY += rowH;
    });

    doc.y = accY + accCardH + 10;
  }

  // ─────────────────────────────────────────────────────────────
  // 4. CALCULATION BREAKDOWN & POLICY EXPLANATION
  // ─────────────────────────────────────────────────────────────
  const ecList = Array.isArray(claim.employeeClaims) ? claim.employeeClaims : [];
  const entriesList = Array.isArray(claim.entries) ? claim.entries : [];

  let explanation = '';
  const hasValidMultiExplanation = claim.plainExplanation && String(claim.plainExplanation).includes('Multi-Entry');

  if (entriesList.length > 1) {
    if (hasValidMultiExplanation) {
      explanation = claim.plainExplanation;
    } else if (grandExc > 0) {
      explanation = `Combined claimed bill across ${entriesList.length} items is Rs. ${formatINR(grandReq)}. Applied policy entitlement limit is Rs. ${formatINR(grandAllow)}. Excess Rs. ${formatINR(grandExc)} deducted per company entitlement policy.`;
    } else {
      explanation = `Combined claimed bill across ${entriesList.length} items is Rs. ${formatINR(grandReq)}. Since the total is within company policy entitlement limit of Rs. ${formatINR(grandAllow)}, full amount of Rs. ${formatINR(grandAllow)} is allowed.`;
    }
  } else {
    const rawExp = claim.plainExplanation || claim.entries?.[0]?.plainExplanation || claim.employeeClaims?.[0]?.items?.[0]?.calculationBreakdown?.plainExplanation;
    if (rawExp && (!rawExp.includes('claimed bill is') || rawExp.includes(String(Math.round(grandReq))))) {
      explanation = rawExp;
    } else if (stayTypeRaw === 'WITH_RELATIVE') {
      explanation = `Stay Type: With Relative${relStayPct !== undefined && relStayPct !== null ? ` (${relStayPct}% Allowance)` : ''}. No hotel bill required. Allowed amount of Rs. ${formatINR(grandAllow)} is auto-calculated per policy.`;
    } else if (grandExc > 0) {
      explanation = `Claimed bill is Rs. ${formatINR(grandReq)}. Policy entitlement limit is Rs. ${formatINR(grandAllow)}. Excess Rs. ${formatINR(grandExc)} deducted per company entitlement policy.`;
    } else {
      explanation = `Claimed bill of Rs. ${formatINR(grandReq)} is within company entitlement policy limit. Fully allowed.`;
    }
  }

  // Clean all rupee symbol encodings (₹ and corrupted ¹) to Rs. so PDFKit never prints ¹
  explanation = String(explanation)
    .replace(/[₹¹]\s*/g, 'Rs. ')
    .replace(/\s+/g, ' ')
    .trim();

  doc.fontSize(8).font('Helvetica');
  const expTextHeight = Math.min(60, doc.heightOfString(explanation, { width: contentWidth - 20 }));
  const expBoxHeight = 18 + expTextHeight + 8;

  ensureSpace(expBoxHeight);
  const expBoxY = doc.y;
  doc.roundedRect(startX, expBoxY, contentWidth, expBoxHeight, 6).fillAndStroke('#f8fafc', '#cbd5e1');
  doc
    .fillColor('#4338ca')
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .text('CALCULATION BREAKDOWN & POLICY COMPLIANCE:', startX + 10, expBoxY + 6);
  doc
    .fillColor('#334155')
    .fontSize(8)
    .font('Helvetica')
    .text(explanation, startX + 10, expBoxY + 18, { width: contentWidth - 20, lineGap: 2 });

  doc.y = expBoxY + expBoxHeight + 10;

  // ─────────────────────────────────────────────────────────────
  // 5. ITEMIZED ENTRIES / EMPLOYEE ALLOCATIONS TABLE
  // ─────────────────────────────────────────────────────────────

  let tableRows = [];

  if (entriesList.length > 0) {
    tableRows = entriesList.map((entry, idx) => {
      const hasEcItems = ecList.some((ec) => Array.isArray(ec.items) && ec.items.length > idx);
      const ecAllowed = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.allowedAmount) || 0), 0) : null;
      const ecExcess = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.excessAmount) || 0), 0) : null;
      const ecClaimed = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.requestedAmount) || 0), 0) : null;

      const claimed = Number(entry.requestedAmount) || (ecClaimed !== null ? ecClaimed : (entriesList.length === 1 ? grandReq : 0));

      let allowed;
      let excess;

      if (hasEcItems && ecAllowed !== null) {
        allowed = ecAllowed;
        excess = ecExcess !== null ? ecExcess : Math.max(0, claimed - allowed);
      } else if (entry.allowedAmount !== undefined && entry.allowedAmount !== null) {
        allowed = Number(entry.allowedAmount);
        excess = entry.excessAmount !== undefined && entry.excessAmount !== null ? Number(entry.excessAmount) : Math.max(0, claimed - allowed);
      } else if (entriesList.length === 1) {
        allowed = grandAllow;
        excess = grandExc;
      } else {
        allowed = grandExc === 0 ? claimed : claimed;
        excess = grandExc === 0 ? 0 : 0;
      }

      const firstEcItem = ecList[0]?.items?.[idx];
      const isConv = (entry.expenseType || firstEcItem?.expenseType || claimType).toUpperCase() === 'CONVEYANCE';
      const isVisit = entry.visitType === 'VISIT' || firstEcItem?.visitType === 'VISIT' || entry.isVisit || firstEcItem?.isVisit;
      const visitTag = isConv ? (isVisit ? ' [Visit]' : ' [No Visit]') : '';
      const stayTag = (isLodging && stayTypeDisplay)
        ? ` [${stayTypeRaw === 'WITH_RELATIVE' ? `Stay with Relative${relStayPct !== undefined && relStayPct !== null ? ` - ${relStayPct}% Allowance` : ''}` : 'Stay in Hotel'}]`
        : '';
      const baseDesc =
        entry.description ||
        entry.remark ||
        entry.remarks ||
        firstEcItem?.description ||
        firstEcItem?.remark ||
        entry.otherSubType ||
        (entry.distanceKm ? `${entry.distanceKm} km (${entry.vehicle || 'Vehicle'})` : 'Expense item');
      const hasStayText = /with relative|in hotel/i.test(String(baseDesc));
      const details = `${baseDesc}${visitTag}${hasStayText ? '' : stayTag}`;

      return {
        sn: idx + 1,
        type: (entry.expenseType || firstEcItem?.expenseType || claimType).toUpperCase(),
        details,
        claimed,
        allowed,
        excess,
      };
    });
  } else if (ecList.length > 0) {
    ecList.forEach((ec, ecIdx) => {
      const eName = ec.employee?.name || `Employee #${ecIdx + 1}`;
      const items = ec.items || [];
      if (items.length > 0) {
        items.forEach((it, itIdx) => {
          tableRows.push({
            sn: `${ecIdx + 1}.${itIdx + 1}`,
            type: (it.expenseType || claimType).toUpperCase(),
            details: `${eName} - ${it.description || it.expenseTypeName || 'Stay / Travel'}`,
            claimed: Number(it.requestedAmount) || 0,
            allowed: Number(it.allowedAmount) || 0,
            excess: Number(it.excessAmount) || 0,
          });
        });
      } else {
        tableRows.push({
          sn: ecIdx + 1,
          type: claimType,
          details: `${eName} (Entitlement Share)`,
          claimed: Number(ec.requestedTotal) || 0,
          allowed: Number(ec.allowedTotal) || 0,
          excess: Number(ec.excessTotal) || 0,
        });
      }
    });
  }

  if (tableRows.length === 0) {
    tableRows.push({
      sn: 1,
      type: claimType,
      details: resolvedPurpose !== 'N/A' ? resolvedPurpose : (trip.purpose || claim.remark || 'Claim Expense Amount'),
      claimed: grandReq,
      allowed: grandAllow,
      excess: grandExc,
    });
  }

  ensureSpace(60);

  doc
    .fillColor('#0f172a')
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .text('EXPENSE CLAIM BREAKDOWN & LINE ITEMS', startX, doc.y);

  doc.y += 4;

  const tableHeaderY = doc.y;
  // Columns total 523pt = contentWidth
  const colW = { sn: 26, type: 85, details: 205, claimed: 65, allowed: 65, excess: 77 };
  doc.rect(startX, tableHeaderY, contentWidth, 20).fill('#0f172a');

  doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
  let tx = startX;
  doc.text('#', tx + 2, tableHeaderY + 6, { width: colW.sn, align: 'center' });
  tx += colW.sn;
  doc.text('CATEGORY', tx + 4, tableHeaderY + 6, { width: colW.type });
  tx += colW.type;
  doc.text('DESCRIPTION / DETAILS', tx + 4, tableHeaderY + 6, { width: colW.details });
  tx += colW.details;
  doc.text('CLAIMED', tx, tableHeaderY + 6, { width: colW.claimed, align: 'right' });
  tx += colW.claimed;
  doc.text('ALLOWED', tx, tableHeaderY + 6, { width: colW.allowed, align: 'right' });
  tx += colW.allowed;
  doc.text('EXCESS', tx, tableHeaderY + 6, { width: colW.excess - 6, align: 'right' });

  let rowY = tableHeaderY + 20;

  tableRows.forEach((row, rIdx) => {
    doc.fontSize(7.5).font('Helvetica');
    const descHeight = Math.max(12, doc.heightOfString(String(row.details), { width: colW.details - 8 }));
    const rowHeight = Math.max(18, Math.min(32, descHeight + 6));

    ensureSpace(rowHeight + 4);
    if (doc.y > rowY) rowY = doc.y;

    const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(startX, rowY, contentWidth, rowHeight).fillAndStroke(bg, '#f1f5f9');

    let rx = startX;
    doc.fillColor('#334155').fontSize(7.5).font('Helvetica');
    doc.text(String(row.sn), rx + 2, rowY + 5, { width: colW.sn, align: 'center' });
    rx += colW.sn;

    doc.font('Helvetica-Bold').text(row.type, rx + 4, rowY + 5, { width: colW.type, ellipsis: true });
    rx += colW.type;

    doc.font('Helvetica').text(row.details, rx + 4, rowY + 5, { width: colW.details - 6, ellipsis: true });
    rx += colW.details;

    // Claimed amount with Rupee icon
    drawAmountWithRupee(doc, rx, rowY + 5, colW.claimed, row.claimed, '#334155', 'right', 7.5);
    rx += colW.claimed;

    // Allowed amount with Rupee icon
    drawAmountWithRupee(doc, rx, rowY + 5, colW.allowed, row.allowed, '#059669', 'right', 7.5);
    rx += colW.allowed;

    // Excess amount with Rupee icon
    drawAmountWithRupee(doc, rx, rowY + 5, colW.excess - 6, row.excess, row.excess > 0 ? '#dc2626' : '#64748b', 'right', 7.5);

    rowY += rowHeight;
  });

  // Table Total Row
  ensureSpace(24);
  if (doc.y > rowY) rowY = doc.y;

  doc.rect(startX, rowY, contentWidth, 20).fillAndStroke('#e2e8f0', '#cbd5e1');
  doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
  doc.text('TOTAL AUDITED VALUES:', startX + 10, rowY + 6, { width: colW.sn + colW.type + colW.details - 10 });

  let rx = startX + colW.sn + colW.type + colW.details;
  drawAmountWithRupee(doc, rx, rowY + 6, colW.claimed, grandReq, '#0f172a', 'right', 8);
  rx += colW.claimed;
  drawAmountWithRupee(doc, rx, rowY + 6, colW.allowed, grandAllow, '#059669', 'right', 8);
  rx += colW.allowed;
  drawAmountWithRupee(doc, rx, rowY + 6, colW.excess - 6, grandExc, grandExc > 0 ? '#dc2626' : '#64748b', 'right', 8);

  doc.y = rowY + 28;

  // ─────────────────────────────────────────────────────────────
  // 6. APPROVAL & VERIFICATION AUDIT (UNIFIED AUDIT CARD)
  // ─────────────────────────────────────────────────────────────
  const fp = claim.fullPayment || {};
  const mgr = claim.managerApproval || {};
  const isMgmt = isClaimantManagement(claim);

  // 1. Full Payment claim: applied, approved, or rejected
  const isFpRequested = Boolean(
    fp.requested ||
    claim.fullPaymentRequested ||
    claim.fullPaymentApproved ||
    (fp.status && fp.status !== 'NOT_REQUESTED') ||
    mgr.kind === 'FULL_PAYMENT' ||
    mgr.approverRole === 'MANAGEMENT' ||
    fp.decidedAt ||
    fp.decidedByName ||
    fp.decidedBy
  );

  // 2. "OTHER" (Normal / Purchase) claim type requiring Reporting Manager approval
  const isOtherCode = (val) => {
    const s = String(val || '').trim().toUpperCase();
    return s === 'OTHER' || s === 'OTHER_EXPENSE';
  };
  const isOtherSub = (val) => {
    const s = String(val || '').trim().toUpperCase();
    return s === 'NORMAL' || s === 'PURCHASE';
  };

  const isOtherClaim = Boolean(
    isOtherCode(claim.claimType) ||
    isOtherCode(claim.expenseType) ||
    isOtherCode(claim.claimMode) ||
    mgr.kind === 'OTHER_EXPENSE' ||
    mgr.approverRole === 'REPORTING_MANAGER' ||
    (Array.isArray(claim.entries) && claim.entries.some((e) => isOtherCode(e?.expenseType) || isOtherSub(e?.otherSubType))) ||
    rawEcList.some((ec) => (ec.items || []).some((it) => isOtherCode(it?.expenseType) || isOtherSub(it?.otherSubType)))
  );

  const shouldShowAuditBox = isFpRequested || isOtherClaim;

  if (shouldShowAuditBox) {
    const isApproved = fp.status === 'APPROVED' || mgr.status === 'APPROVED' || claim.status === 'APPROVED' || claim.paymentStatus === 'PAID';
    const isRejected = fp.status === 'REJECTED' || mgr.status === 'REJECTED' || claim.status === 'REJECTED';

    let approverName = '';
    let appRole = '';
    let appStatus = '';
    let appStatusColor = '#4b5563';
    let badgeText = '';
    let badgeBg = '#f1f5f9';
    let badgeBorder = '#cbd5e1';
    let badgeColor = '#475569';
    let appDecided = mgr.decidedAt || fp.decidedAt;
    let remarks = mgr.remarks || fp.decisionRemarks || '';

    if (isMgmt) {
      approverName = 'Not Applicable (Management User)';
      appRole = 'Management Authority';
      appStatus = 'This approval is not applicable for management user.';
      appStatusColor = '#059669';
      badgeText = 'NOT APPLICABLE';
      badgeBg = '#dcfce7';
      badgeBorder = '#86efac';
      badgeColor = '#15803d';
      appDecided = claim.submittedAt || claim.createdAt;
      remarks = 'This approval is not applicable for management user; forwarded directly to Accounts.';
    } else {
      const approverObj = (typeof mgr.approver === 'object' && mgr.approver !== null) ? mgr.approver : null;
      const baseName = approverObj?.name || mgr.approverName || fp.decidedByName || (typeof mgr.approver === 'string' ? mgr.approver : '') || 'Management Authority';
      const codeStr = approverObj?.employeeIdCode ? ` [${approverObj.employeeIdCode}]` : '';
      approverName = `${baseName}${codeStr}`;

      appRole = isFpRequested
        ? 'Management Approver (Full Payment)'
        : (mgr.approverRole === 'MANAGEMENT' ? 'Management Approver' : 'Reporting Manager');

      if (isApproved) {
        appStatus = isFpRequested ? 'FULL PAYMENT APPROVED' : 'APPROVED';
        appStatusColor = '#059669';
        badgeText = isFpRequested ? 'FULL PAYMENT APPROVED' : 'APPROVED';
        badgeBg = '#dcfce7';
        badgeBorder = '#86efac';
        badgeColor = '#15803d';
      } else if (isRejected) {
        appStatus = isFpRequested ? 'FULL PAYMENT REJECTED' : 'REJECTED';
        appStatusColor = '#dc2626';
        badgeText = isFpRequested ? 'FULL PAYMENT REJECTED' : 'REJECTED';
        badgeBg = '#fee2e2';
        badgeBorder = '#fca5a5';
        badgeColor = '#b91c1c';
      } else {
        appStatus = 'PENDING APPROVAL';
        appStatusColor = '#d97706';
        badgeText = isFpRequested ? 'PENDING MANAGEMENT APPROVAL' : 'AWAITING APPROVAL';
        badgeBg = '#fef3c7';
        badgeBorder = '#fde68a';
        badgeColor = '#b45309';
      }

      if (!remarks && appStatus === 'PENDING APPROVAL') {
        remarks = isFpRequested ? 'Awaiting Management approval decision.' : 'Awaiting Reporting Manager review.';
      }
    }

    // Dynamic measurement
    const headerHeight = 22;
    const colWidth = (contentWidth - 28) / 2;

    // Full Payment fields measurement (if requested)
    let fpReasonH = 0;
    let fpExplH = 0;
    let statusExplanation = '';
    let reasonText = '';

    if (isFpRequested) {
      if (isMgmt) {
        statusExplanation = 'Full Payment Claim: This approval is not applicable for management user. Claim is forwarded directly to Accounts for verification & disbursement.';
      } else if (isApproved) {
        const decDate = fp.decidedAt || mgr.decidedAt;
        statusExplanation = `Full payment APPROVED by ${approverName}${decDate ? ` on ${formatDateTime(decDate)}` : ''}. Full requested amount of Rs. ${formatINR(fp.approvedAmount || grandReq)} authorized for Accounts payment.`;
      } else if (isRejected) {
        const decDate = fp.decidedAt || mgr.decidedAt;
        statusExplanation = `Full payment REJECTED by ${approverName}${decDate ? ` on ${formatDateTime(decDate)}` : ''}. Reimbursement is strictly limited to policy allowed limit of Rs. ${formatINR(grandAllow)}.`;
      } else {
        statusExplanation = `Full payment requested. Awaiting special approval from designated Management authority (${approverName}). Full requested amount becomes payable upon approval; otherwise restricted to standard policy allowed limit of Rs. ${formatINR(grandAllow)}.`;
      }
      statusExplanation = statusExplanation.replace(/[₹¹]\s*/g, 'Rs. ');

      reasonText = fp.reason || claim.fullPaymentReason || 'Special reimbursement justification provided';

      doc.fontSize(7.5).font('Helvetica');
      fpReasonH = doc.heightOfString(`Reason / Justification: "${reasonText}"`, { width: contentWidth - 24 });
      fpExplH = doc.heightOfString(statusExplanation, { width: contentWidth - 24 });
    }

    doc.fontSize(7.5).font('Helvetica');
    const noteText = isMgmt
      ? 'Audit Trail: Management user claim - approval is not applicable. Claim is forwarded directly to Accounts for verification & disbursement.'
      : (remarks ? `Remarks: "${remarks}"` : '');

    let noteH = 0;
    if (noteText) {
      noteH = Math.max(16, doc.heightOfString(noteText, { width: contentWidth - 36 }) + 8);
    }

    const rowsH = 34; // Two standard field rows
    const fpTotalH = isFpRequested ? (6 + 14 + fpReasonH + 3 + fpExplH + 6) : 0;
    const cardPadding = 16;
    const appBoxHeight = headerHeight + rowsH + fpTotalH + (noteH > 0 ? noteH + 8 : 0) + cardPadding;

    ensureSpace(appBoxHeight + 10);
    const appBoxY = doc.y;

    // Card background & border
    doc.roundedRect(startX, appBoxY, contentWidth, appBoxHeight, 6).fillAndStroke('#fcfaff', '#ddd6fe');

    // Header bar
    doc.rect(startX, appBoxY, contentWidth, headerHeight).fill('#f5f3ff');
    doc.fillColor('#5b21b6').fontSize(8).font('Helvetica-Bold').text('APPROVAL & VERIFICATION AUDIT', startX + 10, appBoxY + 7);

    // Status Pill on top right of header
    doc.fontSize(7).font('Helvetica-Bold');
    const pillW = doc.widthOfString(badgeText) + 14;
    const pillH = 14;
    const pillX = startX + contentWidth - pillW - 10;
    const pillY = appBoxY + 4;
    doc.roundedRect(pillX, pillY, pillW, pillH, 3).fillAndStroke(badgeBg, badgeBorder);
    doc.fillColor(badgeColor).text(badgeText, pillX, pillY + 3.5, { width: pillW, align: 'center' });

    // Row 1
    const r1Y = appBoxY + headerHeight + 8;
    // Col 1: Approver / Requirement
    doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(
      isMgmt ? 'Approval Requirement: ' : 'Designated Approver: ',
      startX + 12,
      r1Y,
      { lineBreak: false }
    );
    const appLblW = doc.widthOfString(isMgmt ? 'Approval Requirement: ' : 'Designated Approver: ');
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(
      approverName,
      startX + 12 + appLblW,
      r1Y,
      { width: colWidth - appLblW, ellipsis: true }
    );

    // Col 2: Authority / Role
    const col2X = startX + 16 + colWidth;
    doc.fillColor('#64748b').font('Helvetica').text('Approval Authority: ', col2X, r1Y, { lineBreak: false });
    const authLblW = doc.widthOfString('Approval Authority: ');
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(
      appRole,
      col2X + authLblW,
      r1Y,
      { width: colWidth - authLblW, ellipsis: true }
    );

    // Row 2
    const r2Y = r1Y + 16;
    // Col 1: Decision
    doc.fillColor('#64748b').font('Helvetica').text('Approval Decision: ', startX + 12, r2Y, { lineBreak: false });
    const decLblW = doc.widthOfString('Approval Decision: ');
    doc.fillColor(appStatusColor).font('Helvetica-Bold').text(
      appStatus,
      startX + 12 + decLblW,
      r2Y,
      { width: colWidth - decLblW, ellipsis: true }
    );

    // Col 2: Timestamp
    const dateLabel = isMgmt ? 'Submission Date: ' : (appDecided ? 'Decided On: ' : 'Status Date: ');
    doc.fillColor('#64748b').font('Helvetica').text(dateLabel, col2X, r2Y, { lineBreak: false });
    const dateLblW = doc.widthOfString(dateLabel);
    const dateVal = appDecided ? formatDateTime(appDecided) : 'Awaiting Review';
    doc.fillColor('#0f172a').font('Helvetica').text(
      dateVal,
      col2X + dateLblW,
      r2Y,
      { width: colWidth - dateLblW, ellipsis: true }
    );

    let curInnerY = r2Y + 18;

    // Full Payment Section inside the same unified audit box
    if (isFpRequested) {
      doc.rect(startX + 12, curInnerY, contentWidth - 24, 0.5).fill('#ddd6fe');
      curInnerY += 6;

      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold');
      doc.text(
        `Claimed Full Amount: Rs. ${formatINR(grandReq)}   •   Standard Policy Allowed: Rs. ${formatINR(grandAllow)}   •   Excess Covered: Rs. ${formatINR(grandExc)}`,
        startX + 12,
        curInnerY,
        { width: contentWidth - 24 }
      );
      curInnerY += 13;

      doc.fillColor('#334155').fontSize(7.5).font('Helvetica');
      doc.text(`Reason / Justification: "${reasonText}"`, startX + 12, curInnerY, { width: contentWidth - 24 });
      curInnerY += fpReasonH + 3;

      const explColor = isMgmt ? '#166534' : (isApproved ? '#166534' : (isRejected ? '#991b1b' : '#854d0e'));
      doc.fillColor(explColor).fontSize(7.5).font('Helvetica-Bold');
      doc.text(statusExplanation, startX + 12, curInnerY, { width: contentWidth - 24 });
      curInnerY += fpExplH + 6;
    }

    // Notice / Remarks / Audit Trail Box
    if (noteText && noteH > 0) {
      const noteBoxY = curInnerY;
      const noteBoxW = contentWidth - 24;
      const noteBoxBg = isMgmt ? '#f0fdf4' : '#ffffff';
      const noteBoxBorder = isMgmt ? '#bbf7d0' : '#e2e8f0';
      const noteTextColor = isMgmt ? '#166534' : '#334155';

      doc.roundedRect(startX + 12, noteBoxY, noteBoxW, noteH, 4).fillAndStroke(noteBoxBg, noteBoxBorder);
      doc
        .fillColor(noteTextColor)
        .fontSize(7.5)
        .font(isMgmt ? 'Helvetica' : 'Helvetica-Oblique')
        .text(noteText, startX + 18, noteBoxY + 4, { width: noteBoxW - 12, lineGap: 1.5 });
    }

    doc.y = appBoxY + appBoxHeight + 10;
  }

  // ─────────────────────────────────────────────────────────────
  // 7. PAYMENT & DISBURSEMENT RECORD (IF PAID)
  // ─────────────────────────────────────────────────────────────
  if (isPaid) {
    ensureSpace(52);
    const payBoxY = doc.y;
    const payBoxHeight = 48;
    doc.roundedRect(startX, payBoxY, contentWidth, payBoxHeight, 6).fillAndStroke('#f0fdf4', '#bbf7d0');
    doc.fillColor('#166534').fontSize(8).font('Helvetica-Bold').text('ACCOUNTS DISBURSEMENT & SETTLEMENT RECORD', startX + 10, payBoxY + 6);

    const pDate = formatDateTime(claim.paymentDate || claim.disbursedAt || claim.disbursement?.paymentDate);
    const pRef = claim.paymentReference || claim.utr || claim.disbursement?.paymentReference || 'N/A';
    const pMethod = claim.paymentMethod || claim.disbursement?.paymentMethod || 'Bank Transfer (NEFT/RTGS)';

    const halfWidth = (contentWidth - 28) / 2;
    const rightColX = startX + 14 + halfWidth;

    doc.fillColor('#15803d').fontSize(7.5).font('Helvetica');
    const payPrefix = 'Amount Disbursed: ';
    const pw = doc.widthOfString(payPrefix);
    doc.text(payPrefix, startX + 10, payBoxY + 20, { lineBreak: false });
    drawAmountWithRupee(doc, startX + 10 + pw, payBoxY + 20, halfWidth - pw, paidAmt, '#15803d', 'left', 7.5);
    doc.text(`Payment Method: ${pMethod}`, startX + 10, payBoxY + 32, { width: halfWidth, ellipsis: true });

    doc.text(`Settlement Date: ${pDate}`, rightColX, payBoxY + 20, { width: halfWidth, ellipsis: true });
    doc.text(`Transaction Ref / UTR: ${pRef}`, rightColX, payBoxY + 32, { width: halfWidth, ellipsis: true });

    doc.y = payBoxY + payBoxHeight + 10;
  }

  // ─────────────────────────────────────────────────────────────
  // 8. ATTACHED PROOFS SUMMARY NOTE (PAGE 1)
  // ─────────────────────────────────────────────────────────────
  ensureSpace(24);
  doc.fillColor('#64748b').fontSize(7.5).font('Helvetica');
  if (fetchedProofs.length > 0) {
    doc.text(
      `Attached Proofs: ${fetchedProofs.length} proof item(s) verified and appended in this PDF document (see following pages).`,
      startX,
      doc.y,
      { width: contentWidth }
    );
  } else {
    doc.text('Attached Proofs: No external documents attached to this claim.', startX, doc.y, { width: contentWidth });
  }

  // NOTE: Signatures & Verification boxes have been completely omitted per requirement.

  // ─────────────────────────────────────────────────────────────
  // 8B. ATTACHED PROOFS & PHOTO DOCUMENTATION GALLERY (PAGES 2+)
  // ─────────────────────────────────────────────────────────────
  if (fetchedProofs.length > 0) {
    doc.addPage();

    const cardW = (contentWidth - 14) / 2; // ~254.6pt
    const cardH = 210; // pt

    const drawProofHeader = (isContinuation = false) => {
      const bannerH = isContinuation ? 26 : 34;
      doc.rect(startX, margin, contentWidth, bannerH).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(isContinuation ? 9.5 : 11).font('Helvetica-Bold');
      doc.text(
        isContinuation
          ? 'ATTACHED PROOFS & PHOTO DOCUMENTATION (CONTINUED)'
          : 'ATTACHED PROOFS & PHOTO DOCUMENTATION',
        startX + 12,
        margin + 7
      );
      if (!isContinuation) {
        doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica');
        doc.text(
          `Official Supporting Evidence for Claim #${claim.claimNumber || claim.claimId || claim._id} (${fetchedProofs.length} Item${fetchedProofs.length > 1 ? 's' : ''})`,
          startX + 12,
          margin + 20
        );
      }
      return margin + bannerH + 12;
    };

    let curY = drawProofHeader(false);

    fetchedProofs.forEach((proof, pIdx) => {
      const colIdx = pIdx % 2;
      // Start a new page if needed (before starting a new row)
      if (colIdx === 0 && pIdx > 0 && curY + cardH > pageHeight - margin - 20) {
        doc.addPage();
        curY = drawProofHeader(true);
      }

      const cardX = startX + colIdx * (cardW + 14);
      const cardY = curY;

      // Card outer background & border
      doc.roundedRect(cardX, cardY, cardW, cardH, 5).fillAndStroke('#ffffff', '#cbd5e1');

      // Card header bar (height 20pt)
      doc.roundedRect(cardX, cardY, cardW, 20, 5).fill('#f8fafc');
      doc.rect(cardX, cardY + 15, cardW, 5).fill('#f8fafc');
      doc.rect(cardX, cardY + 20, cardW, 0.5).fill('#e2e8f0');

      // Card header tag
      doc.fillColor(proof.tagColor || '#4f46e5').fontSize(7.5).font('Helvetica-Bold');
      doc.text(proof.tag || 'DOCUMENT PROOF', cardX + 8, cardY + 5, { width: cardW - 16, ellipsis: true });

      // Inner image / preview area (height 152pt)
      const innerX = cardX + 6;
      const innerY = cardY + 24;
      const innerW = cardW - 12;
      const innerH = 152;

      if (proof.status === 'IMAGE' && proof.buffer) {
        try {
          doc.image(proof.buffer, innerX, innerY + 2, {
            fit: [innerW, innerH - 6],
            align: 'center',
            valign: 'center',
          });
        } catch (_) {
          doc.rect(innerX, innerY, innerW, innerH).fill('#f8fafc');
          doc.fillColor('#64748b').fontSize(8).font('Helvetica');
          doc.text('Photo Proof Attached (Verified on Portal)', innerX + 4, innerY + 68, { width: innerW - 8, align: 'center' });
        }
      } else if (proof.status === 'PDF') {
        doc.roundedRect(innerX + 16, innerY + 24, innerW - 32, 96, 4).fillAndStroke('#fef2f2', '#fecaca');
        doc.fillColor('#dc2626').fontSize(18).font('Helvetica-Bold').text('PDF', innerX + 16, innerY + 40, { width: innerW - 32, align: 'center' });
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold').text('PDF Document Proof', innerX + 16, innerY + 66, { width: innerW - 32, align: 'center' });
        doc.fillColor('#64748b').fontSize(7).font('Helvetica').text('Official attached file', innerX + 16, innerY + 80, { width: innerW - 32, align: 'center' });
      } else {
        doc.roundedRect(innerX + 16, innerY + 24, innerW - 32, 96, 4).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fillColor('#4338ca').fontSize(16).font('Helvetica-Bold').text('DOC', innerX + 16, innerY + 40, { width: innerW - 32, align: 'center' });
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold').text('Attachment Proof', innerX + 16, innerY + 66, { width: innerW - 32, align: 'center' });
        doc.fillColor('#64748b').fontSize(7).font('Helvetica').text('Verified in claim records', innerX + 16, innerY + 80, { width: innerW - 32, align: 'center' });
      }

      // Card footer caption bar (height 34pt)
      const footerY = cardY + cardH - 34;
      doc.rect(cardX, footerY, cardW, 34).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold');
      doc.text(proof.title || 'Attached Evidence', cardX + 8, footerY + 5, { width: cardW - 16, ellipsis: true });
      doc.fillColor('#64748b').fontSize(6.8).font('Helvetica');
      doc.text(proof.subtitle || 'Supporting Document', cardX + 8, footerY + 18, { width: cardW - 16, ellipsis: true });

      // Advance row after rendering 2 columns or on the last item
      if (colIdx === 1 || pIdx === fetchedProofs.length - 1) {
        curY += cardH + 12;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 9. PAGE NUMBERING FOOTER (APPLIED TO ALL PAGES)
  // ─────────────────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Disable bottom margin on the page so footer text at the bottom edge never triggers an accidental page break
    doc.page.margins.bottom = 0;
    const footerY = pageHeight - 22;
    doc
      .fillColor('#94a3b8')
      .fontSize(7)
      .font('Helvetica')
      .text('This is an official computer-generated voucher issued by Trucode ERP HRMS System. Confidential.', margin, footerY, { width: contentWidth - 80, lineBreak: false });
    doc
      .fillColor('#94a3b8')
      .fontSize(7)
      .font('Helvetica')
      .text(`Page ${i + 1} of ${range.count}`, margin + contentWidth - 80, footerY, { width: 80, align: 'right', lineBreak: false });
  }

  return new Promise((resolve, reject) => {
    res.on('finish', resolve);
    res.on('error', reject);
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = {
  generateClaimPdf,
  formatINR,
  formatDate,
  formatDateTime,
};
