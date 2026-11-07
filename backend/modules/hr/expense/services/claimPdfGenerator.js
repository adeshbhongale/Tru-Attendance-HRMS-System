const PDFDocument = require('pdfkit');
const axios = require('axios');
const { isManagementUser } = require('./expenseAccess');

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
    levelRef: applicant.levelRef,
    departmentAdminType: applicant.departmentAdminType,
    adminType: applicant.adminType,
  };
  if (isManagementUser(applicant) || isManagementUser(userObj)) return true;
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
    const m = clean.match(/^([^:]+):\s*(?:[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)(?:\s*\/\s*(?:day|night))?|Actuals)/i);
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
      const mTot = clean.match(/\(Total:\s*[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)(?:\s*for\s*(\d+)\s*(?:days?|nights?))?/i);
      if (mTot) {
        totalStay = parseFloat(mTot[1].replace(/,/g, ''));
        if (mTot[2]) stayDays = parseInt(mTot[2], 10);
      }

      parsedMap.set(empNameKey, { perDay: perDayVal, tag, totalStay, stayDays, isActuals });
    }
  }

  // Also check inline pattern if multi-entry: "Individual limits per day: Aditya Pise: 1,200.00/day, Rohan Sharma: 1,000.00/day"
  if (parsedMap.size === 0) {
    const inlineMatch = text.match(/Individual limits per (?:day|night):?\s*([^\n]+?)(?:\s*\(Combined|\n\n|\n[A-Z]|$)/i);
    if (inlineMatch && inlineMatch[1]) {
      const parts = inlineMatch[1].split(/\s*,\s*(?=[^,]+:)/);
      for (const p of parts) {
        const cleanP = p.trim();
        const m = cleanP.match(/^([^:]+):\s*(?:[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)(?:\s*\/\s*(?:day|night))?|Actuals)/i);
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
        const m = String(s).match(/[₹¹]?\s*([0-9,]+(?:\.[0-9]+)?)\s*\/\s*(?:day|night)/i);
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
      const stayNights = Number(claim.lodgingNights ?? claim.numberOfNights ?? ((parsedInfo && parsedInfo.stayDays > 0) ? parsedInfo.stayDays : days)) || days || 1;
      const stayAmt = (parsedInfo && parsedInfo.totalStay > 0)
        ? parsedInfo.totalStay
        : (perDay > 0 && stayNights > 0
          ? perDay * stayNights
          : Number(targetItem.policyLimit ?? ec.policyLimitTotal ?? 0));

      let effectiveStayDays = (parsedInfo && parsedInfo.stayDays > 0) ? parsedInfo.stayDays : stayNights;
      if (!effectiveStayDays && stayAmt > 0 && perDay > 0) {
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
  if (s === 'ACCOUNTS_APPROVED' || ps === 'AWAITING_DISBURSEMENT') {
    return { text: 'APPROVED', bg: '#2563eb', textColor: '#ffffff' };
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

  // Payment confirmation proofs (uploaded by Accounts Admin during payment recording)
  const payProofs = Array.isArray(claim.paymentProofs) && claim.paymentProofs.length > 0
    ? claim.paymentProofs
    : (Array.isArray(claim.disbursement?.paymentProofs) && claim.disbursement.paymentProofs.length > 0
      ? claim.disbursement.paymentProofs
      : (claim.disbursement?.paymentProof?.url ? [claim.disbursement.paymentProof] : []));
  payProofs.forEach((p, pIdx) => {
    addProof({
      category: 'PAYMENT_PROOF',
      tag: 'PAYMENT CONFIRMATION PROOF',
      tagColor: '#059669',
      title: `Payment Confirmation Proof #${pIdx + 1}`,
      subtitle: p.name ? `${p.name}${p.size ? ` • ${Math.round(p.size / 1024)} KB` : ''}` : 'Accounts disbursement confirmation proof',
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
      Author: 'Gatimaan',
      Subject: 'Expense Reimbursement Claim Voucher',
      CreationDate: new Date(),
    },
  });

  doc.pipe(res);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 36;
  const topMargin = 24;
  const contentWidth = pageWidth - margin * 2; // 523.28pt

  let contentPageCount = 1;
  const pageBottomLimit = pageHeight - 28;
  const ensureSpace = (neededHeight) => {
    if (doc.y + neededHeight > pageBottomLimit) {
      doc.addPage();
      contentPageCount += 1;
    }
  };

  const startX = margin;

  /**
   * Helper to render a clean, structured card matching ExpenseClaimDetailContent.jsx
   * with full-width key-value rows (Label on left, Value on right) so text never overlaps.
   */
  const drawStructuredCard = ({
    title,
    badgeText = '',
    badgeBg = '#f1f5f9',
    badgeBorder = '#cbd5e1',
    badgeColor = '#475569',
    headerBg = '#f8fafc',
    headerColor = '#0f172a',
    borderColor = '#cbd5e1',
    cardBg = '#ffffff',
    rows = [],
  }) => {
    const headerH = 16;
    const labelW = 148;
    const valueW = contentWidth - labelW - 24;

    const measuredRows = rows
      .filter((r) => r && r.value !== undefined && r.value !== null && String(r.value).trim() !== '')
      .map((r) => {
        const lbl = String(r.label || '');
        const val = String(r.value || '');
        doc.fontSize(7.3).font('Helvetica');
        const lH = doc.heightOfString(lbl, { width: labelW - 6 });
        doc.fontSize(r.valueSize || 7.4).font(r.valueFont || 'Helvetica-Bold');
        const vH = doc.heightOfString(val, { width: valueW, lineGap: 1 });
        const rH = Math.max(13.5, Math.max(lH, vH) + 4.5);
        return { ...r, lbl, val, rH };
      });

    const rowsTotalH = measuredRows.reduce((s, r) => s + r.rH, 0);
    const totalCardH = headerH + rowsTotalH + 3;

    ensureSpace(totalCardH + 4.5);
    const cardTopY = doc.y;

    doc.roundedRect(startX, cardTopY, contentWidth, totalCardH, 5).fillAndStroke(cardBg, borderColor);
    doc.roundedRect(startX, cardTopY, contentWidth, headerH, 5).fill(headerBg);
    doc.rect(startX, cardTopY + headerH - 5, contentWidth, 5).fill(headerBg);
    doc.rect(startX, cardTopY + headerH, contentWidth, 0.5).fill(borderColor);

    doc.fillColor(headerColor).fontSize(7.6).font('Helvetica-Bold').text(title, startX + 10, cardTopY + 4.2, {
      width: badgeText ? contentWidth - 170 : contentWidth - 20,
      lineBreak: false,
      ellipsis: true,
    });

    if (badgeText) {
      doc.fontSize(6.6).font('Helvetica-Bold');
      const pillW = doc.widthOfString(badgeText) + 12;
      const pillH = 11;
      const pillX = startX + contentWidth - pillW - 8;
      const pillY = cardTopY + 2.5;
      doc.roundedRect(pillX, pillY, pillW, pillH, 3).fillAndStroke(badgeBg, badgeBorder);
      doc.fillColor(badgeColor).text(badgeText, pillX, pillY + 2.2, { width: pillW, align: 'center', lineBreak: false });
    }

    let curRowY = cardTopY + headerH + 1.5;
    measuredRows.forEach((r, idx) => {
      if (idx < measuredRows.length - 1) {
        doc.rect(startX + 8, curRowY + r.rH - 0.5, contentWidth - 16, 0.5).fill('#f1f5f9');
      }
      doc.fillColor('#64748b').fontSize(7.3).font('Helvetica').text(r.lbl, startX + 10, curRowY + 2.5, {
        width: labelW - 6,
      });
      doc
        .fillColor(r.valueColor || '#0f172a')
        .fontSize(r.valueSize || 7.4)
        .font(r.valueFont || 'Helvetica-Bold')
        .text(r.val, startX + 10 + labelW, curRowY + 2.5, {
          width: valueW,
          lineGap: 1,
        });
      curRowY += r.rH;
    });

    doc.y = cardTopY + totalCardH + 4.5;
  };

  // ─────────────────────────────────────────────────────────────
  // 1. TOP HEADER BANNER
  // ─────────────────────────────────────────────────────────────
  const headerHeight = 54;
  const startY = topMargin;

  // Background banner
  doc.rect(startX, startY, contentWidth, headerHeight).fill('#0f172a');

  // Company Name & Subtitle
  const companyName = String(claim.companyId?.name || claim.companyName || 'GATIMAAN').toUpperCase();
  doc
    .fillColor('#ffffff')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(companyName, startX + 14, startY + 8, { width: 330, ellipsis: true });

  doc
    .fillColor('#94a3b8')
    .fontSize(8)
    .font('Helvetica')
    .text('EXPENSE REIMBURSEMENT CLAIM VOUCHER', startX + 14, startY + 24, { width: 330 });

  doc
    .fillColor('#cbd5e1')
    .fontSize(7.8)
    .font('Helvetica')
    .text(`Reference / Voucher ID: ${claim.claimNumber || claim.claimId || claim._id}`, startX + 14, startY + 37, { width: 330, ellipsis: true });

  // Status Badge on Right
  const badge = getStatusBadge(claim.status, claim.paymentStatus);
  const badgeWidth = 124;
  const badgeHeight = 19;
  const badgeX = startX + contentWidth - badgeWidth - 14;
  const badgeY = startY + 9;

  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 4).fill(badge.bg);
  doc
    .fillColor(badge.textColor)
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .text(badge.text, badgeX, badgeY + 5, { width: badgeWidth, align: 'center' });

  // Applied Date below badge
  const appliedDateStr = formatDateTime(claim.submittedAt || claim.createdAt);
  doc
    .fillColor('#94a3b8')
    .fontSize(7.2)
    .font('Helvetica')
    .text(`Applied: ${appliedDateStr}`, badgeX - 40, startY + 35, { width: badgeWidth + 40, align: 'right' });

  doc.y = startY + headerHeight + 6;

  // ─────────────────────────────────────────────────────────────
  // 2. FINANCIAL SUMMARY METRIC BOXES
  // ─────────────────────────────────────────────────────────────
  const grandReq = claim.grandRequested !== undefined ? claim.grandRequested : (claim.requestedAmount || claim.amount || 0);
  const grandAllow = claim.grandAllowed !== undefined ? claim.grandAllowed : (claim.allowedAmount !== undefined ? claim.allowedAmount : grandReq);
  const grandPolicyLim = Number(claim.grandPolicyLimit || claim.policyLimit || grandAllow);
  const grandExc = claim.grandExcess !== undefined ? claim.grandExcess : (claim.excessAmount || 0);
  const payAmt = claim.payableAmount !== undefined ? claim.payableAmount : grandAllow;
  const isPaid = ['PAID', 'DISBURSED', 'SETTLED'].includes(String(claim.status || '').toUpperCase()) || ['PAID', 'DISBURSED'].includes(String(claim.paymentStatus || '').toUpperCase());
  const paidAmt = claim.paidAmount || claim.disbursement?.amount || (isPaid ? payAmt : 0);

  const boxes = [
    { label: 'TOTAL CLAIMED', value: formatINR(grandReq), color: '#0f172a', bg: '#f8fafc', border: '#e2e8f0' },
    { label: 'POLICY LIMIT', value: formatINR(grandPolicyLim), color: '#334155', bg: '#f8fafc', border: '#e2e8f0' },
    { label: 'TOTAL ALLOWED', value: formatINR(grandAllow), color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
    { label: 'EXCESS AMOUNT', value: formatINR(grandExc), color: grandExc > 0 ? '#dc2626' : '#64748b', bg: grandExc > 0 ? '#fff1f2' : '#f8fafc', border: grandExc > 0 ? '#fecdd3' : '#e2e8f0' },
    { label: isPaid ? 'PAID AMOUNT' : 'NET PAYABLE', value: formatINR(isPaid ? paidAmt : payAmt), color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  ];

  const boxGap = 6;
  const boxWidth = (contentWidth - boxGap * (boxes.length - 1)) / boxes.length;
  const boxHeight = 34;
  const metricsY = doc.y;

  boxes.forEach((b, idx) => {
    const bx = startX + idx * (boxWidth + boxGap);
    doc.roundedRect(bx, metricsY, boxWidth, boxHeight, 5).fillAndStroke(b.bg, b.border || '#e2e8f0');
    doc
      .fillColor(b.label === 'EXCESS AMOUNT' && grandExc > 0 ? '#dc2626' : '#64748b')
      .fontSize(6.5)
      .font('Helvetica-Bold')
      .text(b.label, bx, metricsY + 5, { width: boxWidth, align: 'center' });

    doc.fontSize(9).font('Helvetica-Bold');
    const textWidth = doc.widthOfString(b.value);
    const iconSize = 8;
    const iconGap = 2;
    const totalW = iconSize + iconGap + textWidth;
    const contentStartX = bx + (boxWidth - totalW) / 2;

    drawRupee(doc, contentStartX, metricsY + 18, iconSize, b.color);
    doc
      .fillColor(b.color)
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(b.value, contentStartX + iconSize + iconGap, metricsY + 17, { lineBreak: false });
  });

  doc.y = metricsY + boxHeight + 5;

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
  const rawClaimMode = (claim.claimMode || (claim.fromDate ? 'LODGING' : 'NORMAL')).toUpperCase();
  const isLodging = rawClaimMode === 'LODGING' || rawClaimMode === 'LOGGING' || claimType === 'LODGING' || claimType === 'LODGING_EXPENSE' || Boolean(claim.fromDate && claim.toDate);
  const claimMode = isLodging ? 'LODGING' : (rawClaimMode || 'NORMAL');

  const fromDt = claim.fromDate || trip.startDate || trip.fromDate || claim.entries?.[0]?.fromDate || rawEcList[0]?.items?.[0]?.fromDate || null;
  const toDt = claim.toDate || trip.endDate || trip.toDate || claim.entries?.[0]?.toDate || rawEcList[0]?.items?.[0]?.toDate || null;
  const singleDt = claim.claimDate || claim.expenseDate || claim.date || fromDt || toDt || claim.entries?.[0]?.date || rawEcList[0]?.items?.[0]?.date || claim.submittedAt || claim.createdAt || null;

  let derivedStayDays = Number(claim.lodgingNights ?? claim.numberOfNights ?? claim.numberOfDays ?? claim.days ?? 0);
  if (!derivedStayDays && claim.plainExplanation) {
    const mDays = String(claim.plainExplanation).match(/for\s+(\d+)\s*(?:days?|nights?)/i);
    if (mDays) derivedStayDays = parseInt(mDays[1], 10);
  }

  let dateInfo = 'N/A';
  if (isLodging && fromDt && toDt) {
    const nights = derivedStayDays || 1;
    const fDays = claim.foodDays || (claim.includeFood ? nights + 1 : 0);
    dateInfo = `${formatDate(fromDt)} to ${formatDate(toDt)} (${nights} ${nights === 1 ? 'Night' : 'Nights'}${claim.includeFood ? `, ${fDays} Food ${fDays === 1 ? 'Day' : 'Days'}` : ''})`;
  } else if (isLodging && singleDt) {
    const nights = derivedStayDays || 1;
    dateInfo = `${formatDate(singleDt)} (${nights} ${nights === 1 ? 'Day / Night' : 'Days / Nights'})`;
  } else if (singleDt) {
    dateInfo = formatDate(singleDt);
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

  const stayTypeRaw = isLodging ? String(claim.stayType || rawEcList[0]?.items?.[0]?.calculationBreakdown?.stayType || 'IN_HOTEL').toUpperCase() : '';
  const relStayPct = claim.relativeStayPercent ?? rawEcList[0]?.items?.[0]?.calculationBreakdown?.relativeStayPercent;
  const stayTypeDisplay = isLodging
    ? (stayTypeRaw === 'WITH_RELATIVE'
      ? `At Relative${relStayPct !== undefined && relStayPct !== null ? ` (${relStayPct}% Allowance)` : ''}`
      : 'In Hotel')
    : '';
  const isVisitClaim = Boolean(
    claim.visitType === 'VISIT' ||
    claim.isVisit ||
    (Array.isArray(claim.entries) && claim.entries.some((e) => e?.visitType === 'VISIT' || e?.isVisit)) ||
    rawEcList.some((ec) => (ec.items || []).some((it) => it?.visitType === 'VISIT' || it?.isVisit)) ||
    (Array.isArray(claim.serviceReports) && claim.serviceReports.length > 0)
  );
  const expenseTypeDisplay = claimType === claimMode ? claimType : `${claimType} (${claimMode})`;

  const rightFields = [
    ['Expense Type:', expenseTypeDisplay],
    ...(isLodging && stayTypeDisplay ? [['Stay Type:', stayTypeDisplay]] : []),
    ['Visit Option:', isVisitClaim ? '2. Service Call' : '1. Normal Travel'],
    ['Dates / Period:', dateInfo],
    ['Destination:', trip.destination ? `${trip.destination} (Class ${trip.destinationClass || 'C'})` : (claim.city || 'Local / In-City')],
    ['Customer:', resolvedCustomer],
    ['Purpose:', resolvedPurpose],
  ];

  // Calculate required heights dynamically to prevent any text clipping or box overflowing
  const valueWidth = colWidth - 92;
  doc.fontSize(7.5).font('Helvetica-Bold');

  let leftRowsHeight = 0;
  const leftMeasurements = leftFields.map(([lbl, val]) => {
    const vH = Math.max(9.5, doc.heightOfString(String(val), { width: valueWidth }));
    const rH = Math.min(20, vH + 1.5);
    leftRowsHeight += rH;
    return { lbl, val: String(val), rH };
  });

  let rightRowsHeight = 0;
  const rightMeasurements = rightFields.map(([lbl, val]) => {
    const vH = Math.max(9.5, doc.heightOfString(String(val), { width: valueWidth }));
    const rH = Math.min(20, vH + 1.5);
    rightRowsHeight += rH;
    return { lbl, val: String(val), rH };
  });

  const cardContentHeight = Math.max(leftRowsHeight, rightRowsHeight);
  const cardTotalHeight = 18 + cardContentHeight + 4;

  ensureSpace(cardTotalHeight);

  // Left Box: Applicant & Dates Info
  doc.roundedRect(startX, cardY, colWidth, cardTotalHeight, 5).fillAndStroke('#ffffff', '#e2e8f0');
  doc.rect(startX, cardY, colWidth, 16).fill('#f1f5f9');
  doc
    .fillColor('#334155')
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .text(isLodging ? '1. LODGING STAY DATES & CLAIMANT INFO' : '1. CLAIM DATE & CLAIMANT INFO', startX + 8, cardY + 4.5);

  let ly = cardY + 19;
  leftMeasurements.forEach(({ lbl, val, rH }) => {
    doc.fillColor('#64748b').fontSize(7.2).font('Helvetica').text(lbl, startX + 8, ly, { width: 72 });
    doc.fillColor('#0f172a').fontSize(7.2).font('Helvetica-Bold').text(val, startX + 82, ly, { width: valueWidth, ellipsis: true });
    ly += rH;
  });

  // Right Box: Claim & Trip Details
  const rightX = startX + colWidth + 12;
  doc.roundedRect(rightX, cardY, colWidth, cardTotalHeight, 5).fillAndStroke('#ffffff', '#e2e8f0');
  doc.rect(rightX, cardY, colWidth, 16).fill('#f1f5f9');
  doc
    .fillColor('#334155')
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .text('3. CUSTOMER & DESTINATION (CLAIM & JOURNEY)', rightX + 8, cardY + 4.5);

  let ry = cardY + 19;
  rightMeasurements.forEach(({ lbl, val, rH }) => {
    doc.fillColor('#64748b').fontSize(7.2).font('Helvetica').text(lbl, rightX + 8, ry, { width: 72 });
    doc.fillColor('#0f172a').fontSize(7.2).font('Helvetica-Bold').text(val, rightX + 82, ry, { width: valueWidth, ellipsis: true });
    ry += rH;
  });

  doc.y = cardY + cardTotalHeight + 5;

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
      } catch (_) { }
    }
    if (!days) days = 1;

    const empBreakdown = getEmployeeLimitsBreakdown(claim, rawEcList, days, isLodging);
    const headerH = 16;
    const colHeadH = 15;

    // Columns span exact contentWidth (523.28 pt) with vertical grid dividers & 5pt inner cell padding
    const accCols = isLodging
      ? [
        { label: 'ROLE / SL', w: 68, align: 'left' },
        { label: 'EMPLOYEE NAME', w: 126, align: 'left' },
        { label: 'DEPARTMENT / DESIGNATION', w: 173, align: 'left' },
        { label: 'DAILY LIMIT', w: 74, align: 'right' },
        { label: 'STAY LIMIT', w: contentWidth - 441, align: 'right' },
      ]
      : [
        { label: 'ROLE / SL', w: 72, align: 'left' },
        { label: 'EMPLOYEE NAME', w: 145, align: 'left' },
        { label: 'DEPARTMENT / DESIGNATION', w: 194, align: 'left' },
        { label: 'INDIVIDUAL DAILY LIMIT', w: contentWidth - 411, align: 'right' },
      ];

    // Pre-measure each employee row height dynamically so wrapped text never collides or overflows
    const measuredEmpRows = empBreakdown.map((emp) => {
      const nameText = emp.code ? `${emp.name} [${emp.code}]` : emp.name;
      const deptDesig = [emp.desig, emp.dept].filter(Boolean).join(' • ') || 'N/A';

      doc.fontSize(6.8).font('Helvetica-Bold');
      const hRole = doc.heightOfString(String(emp.roleLabel || ''), { width: accCols[0].w - 10 });

      doc.fontSize(7.2).font('Helvetica-Bold');
      const hName = doc.heightOfString(String(nameText || ''), { width: accCols[1].w - 10 });

      doc.fontSize(6.8).font('Helvetica');
      const hDept = doc.heightOfString(String(deptDesig || ''), { width: accCols[2].w - 10 });

      doc.fontSize(7.2).font('Helvetica-Bold');
      const hDaily = doc.heightOfString(String(emp.dailyLimitStr || ''), { width: accCols[3].w - 10 });
      const hStay = isLodging
        ? doc.heightOfString(String(emp.totalLimitStr || 'N/A'), { width: accCols[4].w - 10 })
        : 0;

      const rowH = Math.max(17, Math.ceil(Math.max(hRole, hName, hDept, hDaily, hStay)) + 7);
      return { emp, nameText, deptDesig, rowH };
    });

    const firstRowH = measuredEmpRows[0]?.rowH || 17;
    ensureSpace(headerH + colHeadH + firstRowH + 6);

    const drawSec2Header = (topY, isContinuation = false) => {
      // Title banner
      doc.rect(startX, topY, contentWidth, headerH).fillAndStroke('#f8fafc', '#cbd5e1');
      doc
        .fillColor('#1e293b')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text(
          `2. SELECTED EMPLOYEES — ACCOMPANIED EMPLOYEES & INDIVIDUAL POLICY LIMITS (${empBreakdown.length} EMPLOYEES)${isContinuation ? ' (CONT.)' : ''}`,
          startX + 8,
          topY + 4.5,
          { width: contentWidth - 16, lineBreak: false }
        );

      // Column headers
      const cHeadY = topY + headerH;
      doc.rect(startX, cHeadY, contentWidth, colHeadH).fillAndStroke('#f1f5f9', '#cbd5e1');

      let hx = startX;
      doc.fillColor('#334155').fontSize(6.8).font('Helvetica-Bold');
      accCols.forEach((c, cIdx) => {
        if (cIdx > 0) {
          doc.save().moveTo(hx, cHeadY).lineTo(hx, cHeadY + colHeadH).lineWidth(0.5).strokeColor('#cbd5e1').stroke().restore();
        }
        doc.text(c.label, hx + 5, cHeadY + 4, { width: c.w - 10, align: c.align, lineBreak: false });
        hx += c.w;
      });

      return cHeadY + colHeadH;
    };

    let curRowY = drawSec2Header(doc.y, false);

    measuredEmpRows.forEach(({ emp, nameText, deptDesig, rowH }, eIdx) => {
      if (curRowY + rowH > pageBottomLimit) {
        doc.y = curRowY;
        ensureSpace(headerH + colHeadH + rowH + 6);
        curRowY = drawSec2Header(doc.y, true);
      }

      const bg = eIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(startX, curRowY, contentWidth, rowH).fillAndStroke(bg, '#cbd5e1');

      // Draw vertical column dividers for clean cell separation
      let divX = startX;
      for (let cIdx = 0; cIdx < accCols.length - 1; cIdx++) {
        divX += accCols[cIdx].w;
        doc.save().moveTo(divX, curRowY).lineTo(divX, curRowY + rowH).lineWidth(0.5).strokeColor('#e2e8f0').stroke().restore();
      }

      let rx = startX;
      // Col 1: Role / SL
      const roleColor = emp.isPrimary ? '#4338ca' : '#64748b';
      doc.fillColor(roleColor).fontSize(6.8).font('Helvetica-Bold');
      doc.text(emp.roleLabel, rx + 5, curRowY + 4.5, { width: accCols[0].w - 10 });
      rx += accCols[0].w;

      // Col 2: Employee Name & Code
      doc.fillColor('#0f172a').fontSize(7.2).font('Helvetica-Bold');
      doc.text(nameText, rx + 5, curRowY + 4.5, { width: accCols[1].w - 10 });
      rx += accCols[1].w;

      // Col 3: Department / Designation
      doc.fillColor('#334155').fontSize(6.8).font('Helvetica');
      doc.text(deptDesig, rx + 5, curRowY + 4.5, { width: accCols[2].w - 10 });
      rx += accCols[2].w;

      // Col 4: Daily Limit
      doc.fillColor('#059669').fontSize(7.2).font('Helvetica-Bold');
      doc.text(emp.dailyLimitStr, rx + 5, curRowY + 4.5, { width: accCols[3].w - 10, align: 'right' });
      rx += accCols[3].w;

      // Col 5: Stay Limit (Lodging only)
      if (isLodging) {
        doc.fillColor('#4338ca').fontSize(7.2).font('Helvetica-Bold');
        doc.text(emp.totalLimitStr || 'N/A', rx + 5, curRowY + 4.5, { width: accCols[4].w - 10, align: 'right' });
      }

      curRowY += rowH;
    });

    doc.y = curRowY + 5;
  }

  // Prepare explanation text for Section 6 (rendered after Section 5 & Approvals)
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
      explanation = `Stay Type: At Relative${relStayPct !== undefined && relStayPct !== null ? ` (${relStayPct}% Allowance)` : ''}. No hotel bill required. Allowed amount of Rs. ${formatINR(grandAllow)} is auto-calculated per policy.`;
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

  // ─────────────────────────────────────────────────────────────
  // 5. ITEMIZED ENTRIES / EMPLOYEE ALLOCATIONS TABLE
  // ─────────────────────────────────────────────────────────────

  let tableRows = [];

  if (entriesList.length > 0) {
    tableRows = entriesList.map((entry, idx) => {
      const hasEcItems = ecList.some((ec) => Array.isArray(ec.items) && ec.items.length > idx);
      const ecAllowed = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.allowedAmount) || 0), 0) : null;
      const ecPolicy = hasEcItems ? ecList.reduce((s, ec) => s + (Number(ec.items?.[idx]?.policyLimit ?? ec.items?.[idx]?.allowedAmount) || 0), 0) : null;
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

      const policyLimit = Number(entry.policyLimit) || (ecPolicy !== null && ecPolicy > 0 ? ecPolicy : allowed);

      const firstEcItem = ecList[0]?.items?.[idx];
      const itemType = (entry.expenseType || firstEcItem?.expenseType || claimType).toUpperCase();
      const isConv = itemType === 'CONVEYANCE';
      const isVisit = entry.visitType === 'VISIT' || firstEcItem?.visitType === 'VISIT' || entry.isVisit || firstEcItem?.isVisit;
      const visitTag = isConv ? (isVisit ? ' [Visit]' : ' [No Visit]') : '';
      const stayTag = (isLodging && itemType === 'LODGING' && stayTypeDisplay)
        ? ` [${stayTypeRaw === 'WITH_RELATIVE' ? `Stay at Relative${relStayPct !== undefined && relStayPct !== null ? ` - ${relStayPct}% Allowance` : ''}` : 'Stay in Hotel'}]`
        : '';
      const modeName = entry.travelModeName || firstEcItem?.travelModeName || entry.mode || '';
      const subName = entry.travelSubtypeName || firstEcItem?.travelSubtypeName || '';
      const travelPrefix = itemType === 'TRAVEL' && (modeName || subName)
        ? `${[modeName, subName].filter(Boolean).join(' - ')}${entry.distanceKm ? ` (${entry.distanceKm} km @ Rs.${entry.ratePerKm || 0}/km)` : ''}: `
        : '';
      const baseDesc =
        entry.description ||
        entry.remark ||
        entry.remarks ||
        firstEcItem?.description ||
        firstEcItem?.remark ||
        entry.otherSubType ||
        (entry.distanceKm ? `${entry.distanceKm} km (${entry.vehicle || modeName || 'Vehicle'})` : 'Expense item');
      const materialName = entry.materialName || firstEcItem?.materialName || '';
      const barcode = entry.barcodeNumber || firstEcItem?.barcodeNumber || '';
      const qty = entry.quantity || firstEcItem?.quantity || '';
      const isStockItem = itemType === 'STOCK_PURCHASE'
        || (itemType === 'OTHER' && String(entry.otherSubType || firstEcItem?.otherSubType || '').toUpperCase() === 'PURCHASE')
        || Boolean(materialName || barcode);
      const stockTag = isStockItem
        ? ` [${materialName ? `Material: ${materialName}, ` : ''}Barcode: ${barcode || 'N/A'}${qty ? `, Qty: ${qty}` : ''}]`
        : '';
      const hasStayText = /at relative|in hotel/i.test(String(baseDesc));
      const hasModeText = modeName && String(baseDesc).toLowerCase().includes(String(modeName).toLowerCase());
      const hasBarcodeText = barcode && String(baseDesc).includes(String(barcode));
      const details = `${hasModeText ? '' : travelPrefix}${baseDesc}${hasBarcodeText ? '' : stockTag}${visitTag}${hasStayText ? '' : stayTag}`;

      return {
        sn: idx + 1,
        type: (entry.expenseType || firstEcItem?.expenseType || claimType).toUpperCase(),
        details,
        claimed,
        policyLimit,
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
          const alw = Number(it.allowedAmount) || 0;
          tableRows.push({
            sn: `${ecIdx + 1}.${itIdx + 1}`,
            type: (it.expenseType || claimType).toUpperCase(),
            details: `${eName} - ${it.description || it.expenseTypeName || 'Stay / Travel'}`,
            claimed: Number(it.requestedAmount) || 0,
            policyLimit: Number(it.policyLimit || alw),
            allowed: alw,
            excess: Number(it.excessAmount) || 0,
          });
        });
      } else {
        const alw = Number(ec.allowedTotal) || 0;
        tableRows.push({
          sn: ecIdx + 1,
          type: claimType,
          details: `${eName} (Entitlement Share)`,
          claimed: Number(ec.requestedTotal) || 0,
          policyLimit: alw,
          allowed: alw,
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
      policyLimit: grandPolicyLim,
      allowed: grandAllow,
      excess: grandExc,
    });
  }

  // Group categories for Level 2 summary strip
  const catCountsMap = new Map();
  tableRows.forEach((r) => {
    const k = r.type === 'LODGING' || r.type === 'LOGGING' ? 'Accommodation Claim' : `${r.type} Claim`;
    catCountsMap.set(k, (catCountsMap.get(k) || 0) + 1);
  });
  const catSummaryStr = Array.from(catCountsMap.entries())
    .map(([k, cnt]) => `${k} (${cnt} ${cnt === 1 ? 'entry' : 'entries'})`)
    .join(', ');

  // Columns total exact contentWidth (523.28 pt) with 5pt horizontal cell padding
  const colW = {
    sn: 24,
    type: 68,
    details: contentWidth - 368,
    claimed: 69,
    policyLimit: 69,
    allowed: 69,
    excess: 69,
  };
  const colKeys = ['sn', 'type', 'details', 'claimed', 'policyLimit', 'allowed', 'excess'];

  const drawSec4TableHeader = (topY) => {
    doc.rect(startX, topY, contentWidth, 16).fillAndStroke('#0f172a', '#0f172a');
    doc.fillColor('#ffffff').fontSize(6.8).font('Helvetica-Bold');

    const headers = [
      { label: '#', w: colW.sn, align: 'center' },
      { label: 'CATEGORY', w: colW.type, align: 'left' },
      { label: 'DESCRIPTION / DETAILS', w: colW.details, align: 'left' },
      { label: 'CLAIMED', w: colW.claimed, align: 'right' },
      { label: 'POLICY LIMIT', w: colW.policyLimit, align: 'right' },
      { label: 'ALLOWED', w: colW.allowed, align: 'right' },
      { label: 'EXCESS', w: colW.excess, align: 'right' },
    ];

    let tx = startX;
    headers.forEach((h, hIdx) => {
      if (hIdx > 0) {
        doc.save().moveTo(tx, topY).lineTo(tx, topY + 16).lineWidth(0.5).strokeColor('#334155').stroke().restore();
      }
      doc.text(h.label, tx + 4, topY + 4.5, { width: h.w - 8, align: h.align, lineBreak: false });
      tx += h.w;
    });

    return topY + 16;
  };

  ensureSpace(56);

  const sec4HeaderY = doc.y;
  doc.rect(startX, sec4HeaderY, contentWidth, 16).fillAndStroke('#f8fafc', '#cbd5e1');
  doc
    .fillColor('#0f172a')
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .text('4. EXPENSE DETAILS — EXPENSE CLAIM BREAKDOWN & LINE ITEMS', startX + 8, sec4HeaderY + 4.5, { lineBreak: false });
  doc
    .fillColor('#4338ca')
    .fontSize(6.8)
    .font('Helvetica-Bold')
    .text(`Claim Categories (${catCountsMap.size}): ${catSummaryStr}`, startX + 268, sec4HeaderY + 4.5, {
      width: contentWidth - 276,
      align: 'right',
      lineBreak: false,
      ellipsis: true,
    });

  let rowY = drawSec4TableHeader(sec4HeaderY + 16);

  tableRows.forEach((row, rIdx) => {
    doc.fontSize(7).font('Helvetica-Bold');
    const typeHeight = doc.heightOfString(String(row.type || ''), { width: colW.type - 10 });
    doc.fontSize(7.2).font('Helvetica');
    const descHeight = Math.max(10, doc.heightOfString(String(row.details || ''), { width: colW.details - 10 }));
    const rowHeight = Math.max(16, Math.ceil(Math.max(typeHeight, descHeight)) + 6);

    if (rowY + rowHeight > pageBottomLimit) {
      doc.y = rowY;
      ensureSpace(16 + rowHeight + 6);
      rowY = drawSec4TableHeader(doc.y);
    }

    const bg = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(startX, rowY, contentWidth, rowHeight).fillAndStroke(bg, '#cbd5e1');

    // Vertical column dividers
    let divX = startX;
    for (let cIdx = 0; cIdx < colKeys.length - 1; cIdx++) {
      divX += colW[colKeys[cIdx]];
      doc.save().moveTo(divX, rowY).lineTo(divX, rowY + rowHeight).lineWidth(0.5).strokeColor('#e2e8f0').stroke().restore();
    }

    let rx = startX;
    doc.fillColor('#334155').fontSize(7.2).font('Helvetica');
    doc.text(String(row.sn), rx + 3, rowY + 4, { width: colW.sn - 6, align: 'center', lineBreak: false });
    rx += colW.sn;

    doc.fillColor('#0f172a').fontSize(7).font('Helvetica-Bold').text(String(row.type || ''), rx + 5, rowY + 4, { width: colW.type - 10 });
    rx += colW.type;

    doc.fillColor('#334155').fontSize(7.2).font('Helvetica').text(String(row.details || ''), rx + 5, rowY + 4, { width: colW.details - 10 });
    rx += colW.details;

    // Claimed amount
    doc.fillColor('#0f172a').fontSize(7).font('Helvetica-Bold');
    doc.text(`Rs. ${formatINR(row.claimed)}`, rx + 4, rowY + 4, { width: colW.claimed - 8, align: 'right', lineBreak: false });
    rx += colW.claimed;

    // Policy Limit amount
    const rowPolLim = row.policyLimit !== undefined ? row.policyLimit : row.allowed;
    doc.fillColor('#475569').fontSize(7).font('Helvetica-Bold');
    doc.text(`Rs. ${formatINR(rowPolLim)}`, rx + 4, rowY + 4, { width: colW.policyLimit - 8, align: 'right', lineBreak: false });
    rx += colW.policyLimit;

    // Allowed amount
    doc.fillColor('#059669').fontSize(7).font('Helvetica-Bold');
    doc.text(`Rs. ${formatINR(row.allowed)}`, rx + 4, rowY + 4, { width: colW.allowed - 8, align: 'right', lineBreak: false });
    rx += colW.allowed;

    // Excess amount (Red when excess > 0)
    doc.fillColor(row.excess > 0 ? '#dc2626' : '#64748b').fontSize(7).font('Helvetica-Bold');
    doc.text(`Rs. ${formatINR(row.excess)}`, rx + 4, rowY + 4, { width: colW.excess - 8, align: 'right', lineBreak: false });

    rowY += rowHeight;
  });

  // Table Total Row (Total Claim Amount — matching Claim Details UI)
  if (rowY + 20 > pageBottomLimit) {
    doc.y = rowY;
    ensureSpace(22);
    rowY = doc.y;
  }

  const totalRowH = 18;
  doc.rect(startX, rowY, contentWidth, totalRowH).fillAndStroke('#e2e8f0', '#cbd5e1');

  // Vertical column dividers in Total Row for numeric columns
  let totDivX = startX + colW.sn + colW.type + colW.details;
  [colW.claimed, colW.policyLimit, colW.allowed, colW.excess].forEach((w) => {
    doc.save().moveTo(totDivX, rowY).lineTo(totDivX, rowY + totalRowH).lineWidth(0.5).strokeColor('#cbd5e1').stroke().restore();
    totDivX += w;
  });

  doc.fillColor('#0f172a').fontSize(7.4).font('Helvetica-Bold');
  doc.text(`Total Claim Amount (Payable: Rs. ${formatINR(payAmt)}):`, startX + 8, rowY + 5, {
    width: colW.sn + colW.type + colW.details - 12,
    lineBreak: false,
  });

  let rx = startX + colW.sn + colW.type + colW.details;
  doc.fillColor('#0f172a').fontSize(7.2).font('Helvetica-Bold');
  doc.text(`Rs. ${formatINR(grandReq)}`, rx + 4, rowY + 5, { width: colW.claimed - 8, align: 'right', lineBreak: false });
  rx += colW.claimed;

  doc.fillColor('#334155').fontSize(7.2).font('Helvetica-Bold');
  doc.text(`Rs. ${formatINR(grandPolicyLim)}`, rx + 4, rowY + 5, { width: colW.policyLimit - 8, align: 'right', lineBreak: false });
  rx += colW.policyLimit;

  doc.fillColor('#059669').fontSize(7.2).font('Helvetica-Bold');
  doc.text(`Rs. ${formatINR(grandAllow)}`, rx + 4, rowY + 5, { width: colW.allowed - 8, align: 'right', lineBreak: false });
  rx += colW.allowed;

  doc.fillColor(grandExc > 0 ? '#dc2626' : '#64748b').fontSize(7.2).font('Helvetica-Bold');
  doc.text(`Rs. ${formatINR(grandExc)}`, rx + 4, rowY + 5, { width: colW.excess - 8, align: 'right', lineBreak: false });

  doc.y = rowY + totalRowH + 6;

  // ─────────────────────────────────────────────────────────────
  // 5. FULL PAYMENT DETAILS & APPROVALS (STRUCTURED CLAIM DETAILS CARDS)
  // ─────────────────────────────────────────────────────────────
  const fp = claim.fullPayment || {};
  const mgr = claim.managerApproval || {};
  const fin = claim.financeApproval || {};
  const acc = claim.accountsApproval || {};
  const rej = claim.rejection || {};
  const isMgmt = isClaimantManagement(claim);
  const statusUpper = String(claim.status || '').toUpperCase();

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

  const normalizeTypeCode = (val) => {
    const c = String(val || '').trim().toUpperCase();
    if (!c) return '';
    if (c === 'PETROL' || c === 'LOCAL_CONVEYANCE' || c === 'LOCAL_TRAVEL') return 'CONVEYANCE';
    if (c === 'STAY' || c === 'HOTEL' || c === 'ACCOMMODATION') return 'LODGING';
    if (c === 'MEAL' || c === 'DA' || c === 'DAILY_ALLOWANCE') return 'FOOD';
    if (c === 'STOCK' || c === 'PURCHASE') return 'STOCK_PURCHASE';
    if (c === 'MISC' || c === 'MISCELLANEOUS' || c === 'OTHER_EXPENSE') return 'OTHER';
    return c;
  };
  const claimTypeCodes = Array.from(
    new Set(
      [
        normalizeTypeCode(claim.claimType),
        normalizeTypeCode(claim.expenseType),
        ...(Array.isArray(claim.entries)
          ? claim.entries.map((e) =>
              String(e?.otherSubType || '').trim().toUpperCase() === 'PURCHASE'
                ? 'STOCK_PURCHASE'
                : normalizeTypeCode(e?.expenseType)
            )
          : []),
        ...rawEcList.flatMap((ec) =>
          (ec.items || []).map((it) =>
            String(it?.otherSubType || '').trim().toUpperCase() === 'PURCHASE'
              ? 'STOCK_PURCHASE'
              : normalizeTypeCode(it?.expenseType)
          )
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
      ((isFpRequested && cfoCfgFullPayment) ||
        claimTypeCodes.some((code) => cfoCfgTypes.includes(code)))
  );

  // 2. "OTHER" (Normal) or "STOCK_PURCHASE" claim type requiring Reporting Manager approval
  const isOtherCode = (val) => {
    const s = String(val || '').trim().toUpperCase();
    return s === 'OTHER' || s === 'OTHER_EXPENSE' || s === 'STOCK_PURCHASE';
  };
  const isOtherSub = (val) => {
    const s = String(val || '').trim().toUpperCase();
    return s === 'NORMAL' || s === 'PURCHASE';
  };
  const isStockPurchase = Boolean(
    String(claim.claimType || '').trim().toUpperCase() === 'STOCK_PURCHASE' ||
    String(claim.expenseType || '').trim().toUpperCase() === 'STOCK_PURCHASE' ||
    (Array.isArray(claim.entries) && claim.entries.some((e) => String(e?.expenseType || '').trim().toUpperCase() === 'STOCK_PURCHASE' || String(e?.otherSubType || '').trim().toUpperCase() === 'PURCHASE')) ||
    rawEcList.some((ec) => (ec.items || []).some((it) => String(it?.expenseType || '').trim().toUpperCase() === 'STOCK_PURCHASE' || String(it?.otherSubType || '').trim().toUpperCase() === 'PURCHASE'))
  );

  const isOtherClaim = Boolean(
    isOtherCode(claim.claimType) ||
    isOtherCode(claim.expenseType) ||
    isOtherCode(claim.claimMode) ||
    mgr.kind === 'OTHER_EXPENSE' ||
    mgr.approverRole === 'REPORTING_MANAGER' ||
    (Array.isArray(claim.entries) && claim.entries.some((e) => isOtherCode(e?.expenseType) || isOtherSub(e?.otherSubType))) ||
    rawEcList.some((ec) => (ec.items || []).some((it) => isOtherCode(it?.expenseType) || isOtherSub(it?.otherSubType)))
  );

  const hasManagerApproval = Boolean(
    mgr.approver ||
    mgr.approverName ||
    (mgr.status && mgr.status !== 'NOT_REQUIRED') ||
    mgr.decidedAt ||
    mgr.remarks
  );
  const hasFinanceApproval = Boolean(
    fin.approver ||
    fin.approverName ||
    (fin.status && fin.status !== 'NOT_REQUIRED') ||
    fin.decidedAt ||
    fin.remarks
  );
  const hasAccountsApproval = Boolean(
    statusUpper === 'ACCOUNTS_APPROVED' ||
    acc.approvedBy ||
    acc.approvedByName ||
    acc.approvedAt ||
    acc.remarks ||
    (acc.status && !['NOT_REQUIRED', 'PENDING'].includes(String(acc.status).toUpperCase()))
  );
  const hasRejectionRecord = Boolean(
    statusUpper === 'REJECTED' ||
    rej.reason ||
    rej.rejectedAt ||
    rej.rejectedByName ||
    rej.rejectedBy
  );

  const shouldShowAuditBox = isFpRequested || isCfoApplicableByRule || (isOtherClaim && mgr.status !== 'NOT_REQUIRED') || hasManagerApproval || hasFinanceApproval;

  // Shared approval resolution for both Section 5 and Section 8 (matching ExpenseClaimDetailContent.jsx)
  const isStep1Rejected = mgr.status === 'REJECTED' || (!mgr.status && (fp.status === 'REJECTED' || statusUpper === 'REJECTED'));
  const isStep1Approved = !isStep1Rejected && Boolean(
    mgr.status === 'APPROVED' ||
    fp.status === 'APPROVED' ||
    fin.status === 'PENDING' ||
    fin.status === 'APPROVED' ||
    ['SUBMITTED', 'APPROVED', 'ACCOUNTS_APPROVED', 'PAID', 'DISBURSED', 'SETTLED'].includes(statusUpper) ||
    claim.paymentStatus === 'PAID'
  );
  const isOverallRejected = isStep1Rejected || fin.status === 'REJECTED' || fp.status === 'REJECTED' || statusUpper === 'REJECTED';
  const isOverallApproved = !isOverallRejected && Boolean(
    fp.status === 'APPROVED' ||
    fin.status === 'APPROVED' ||
    (isStep1Approved && (!hasFinanceApproval && !isCfoApplicableByRule)) ||
    ['SUBMITTED', 'APPROVED', 'ACCOUNTS_APPROVED', 'PAID', 'DISBURSED', 'SETTLED'].includes(statusUpper) ||
    claim.paymentStatus === 'PAID'
  );

  const subReportsTo = (typeof claim.submittedBy === 'object' && claim.submittedBy?.reportsTo && typeof claim.submittedBy.reportsTo === 'object')
    ? claim.submittedBy.reportsTo
    : null;
  const approverObj = (typeof mgr.approver === 'object' && mgr.approver !== null)
    ? mgr.approver
    : subReportsTo;
  const mgrBaseName = approverObj?.name || mgr.approverName || fp.decidedByName || (typeof mgr.approver === 'string' ? mgr.approver : '') || 'Reporting Manager';
  const mgrCodeRaw = approverObj?.employeeIdCode || '';

  const showFinSection = !isMgmt && Boolean(isCfoApplicableByRule || hasFinanceApproval);
  const finObj = (typeof fin.approver === 'object' && fin.approver !== null) ? fin.approver : null;
  const finBaseName = finObj?.name || fin.approverName || (typeof fin.approver === 'string' ? fin.approver : '') || 'CFO / Finance Head';
  const finCodeRaw = finObj?.employeeIdCode || '';
  const isFinRejected = fin.status === 'REJECTED';
  const isFinApproved =
    !isFinRejected &&
    !isStep1Rejected &&
    Boolean(
      fin.status === 'APPROVED' ||
      fp.status === 'APPROVED' ||
      ['SUBMITTED', 'APPROVED', 'ACCOUNTS_APPROVED', 'PAID', 'DISBURSED', 'SETTLED'].includes(statusUpper) ||
      isPaid
    );

  const accObjShared = (typeof acc.approvedBy === 'object' && acc.approvedBy !== null) ? acc.approvedBy : null;
  const accBaseName = accObjShared?.name || acc.approvedByName || (isPaid ? (claim.disbursement?.recordedByName || claim.disbursedBy?.name || 'Accounts Admin') : 'Accounts Admin');
  const accCodeRaw = accObjShared?.employeeIdCode || '';
  const isAccountsStep1Approved = Boolean(acc.status === 'APPROVED' || statusUpper === 'ACCOUNTS_APPROVED' || isPaid);
  const isAccountsRejected = acc.status === 'REJECTED' || (statusUpper === 'REJECTED' && !isStep1Rejected && !isFinRejected);

  if (shouldShowAuditBox) {
    let approverName = '';
    let appRole = '';
    let appStatus = '';
    let appStatusColor = '#4b5563';
    let badgeText = '';
    let badgeBg = '#f1f5f9';
    let badgeBorder = '#cbd5e1';
    let badgeColor = '#475569';
    let appDecided = mgr.decidedAt || fp.decidedAt;
    let dateLabel = 'Status Date:';
    let dateVal = 'Awaiting Review';
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
      dateLabel = 'Submission Date:';
      dateVal = appDecided ? formatDateTime(appDecided) : 'Submitted';
      remarks = 'This approval is not applicable for management user; forwarded directly to Accounts.';
    } else {
      const codeStr = mgrCodeRaw ? ` [${mgrCodeRaw}]` : '';
      approverName = `${mgrBaseName}${codeStr}`;

      const baseRole = isFpRequested
        ? 'Management Approver (Full Payment)'
        : (mgr.approverRole === 'MANAGEMENT' ? 'Management Approver' : 'Reporting Manager');
      const roleDesig = [approverObj?.designation, approverObj?.department].filter(Boolean).join(' • ');
      appRole = roleDesig ? `${baseRole} (${roleDesig})` : baseRole;

      if (isStep1Approved) {
        appStatus = isFpRequested ? 'FULL PAYMENT APPROVED' : 'APPROVED';
        appStatusColor = '#059669';
        dateLabel = 'Decided On:';
        dateVal = appDecided
          ? formatDateTime(appDecided)
          : (fin.requestedAt ? formatDateTime(fin.requestedAt) : ((claim.submittedAt || claim.createdAt) ? formatDateTime(claim.submittedAt || claim.createdAt) : 'Approved'));
        if (!remarks && isFpRequested && fpProofs.length > 0) {
          remarks = 'Full payment requested with supporting proofs. Routed directly to Accounts for review of proofs and disbursement.';
        }
      } else if (isStep1Rejected) {
        appStatus = isFpRequested ? 'FULL PAYMENT REJECTED' : 'REJECTED';
        appStatusColor = '#dc2626';
        dateLabel = 'Decided On:';
        dateVal = (appDecided || rej.rejectedAt) ? formatDateTime(appDecided || rej.rejectedAt) : 'Rejected';
      } else {
        appStatus = 'PENDING APPROVAL';
        appStatusColor = '#d97706';
        dateLabel = mgr.requestedAt ? 'Requested On:' : 'Status Date:';
        dateVal = mgr.requestedAt ? formatDateTime(mgr.requestedAt) : 'Awaiting Review';
      }

      if (isOverallApproved) {
        badgeText = isFpRequested ? 'FULL PAYMENT APPROVED' : 'APPROVED';
        badgeBg = '#dcfce7';
        badgeBorder = '#86efac';
        badgeColor = '#15803d';
      } else if (isOverallRejected) {
        badgeText = isFpRequested ? 'FULL PAYMENT REJECTED' : 'REJECTED';
        badgeBg = '#fee2e2';
        badgeBorder = '#fca5a5';
        badgeColor = '#b91c1c';
      } else if (fin.status === 'PENDING') {
        badgeText = 'AWAITING 2ND APPROVAL (CFO)';
        badgeBg = '#fef3c7';
        badgeBorder = '#fde68a';
        badgeColor = '#b45309';
      } else {
        badgeText = isFpRequested ? 'PENDING MANAGEMENT APPROVAL' : 'AWAITING APPROVAL';
        badgeBg = '#fef3c7';
        badgeBorder = '#fde68a';
        badgeColor = '#b45309';
      }

      if (!remarks && appStatus === 'PENDING APPROVAL') {
        remarks = isFpRequested ? 'Awaiting Management approval decision.' : 'Awaiting Reporting Manager review.';
      }
    }

    // 5. Full Payment Details Card (when Full Payment is requested)
    if (isFpRequested) {
      let statusExplanation = '';
      if (isMgmt) {
        statusExplanation = 'Full Payment Claim: Management user exemption applied — forwarded directly to Accounts.';
      } else if (isOverallApproved) {
        const decDate = fin.decidedAt || fp.decidedAt || mgr.decidedAt;
        statusExplanation = `Full payment APPROVED by ${approverName}${decDate ? ` on ${formatDateTime(decDate)}` : ''}. Full requested amount of Rs. ${formatINR(fp.approvedAmount || grandReq)} authorized for Accounts payment.`;
      } else if (isOverallRejected) {
        const decDate = fin.decidedAt || fp.decidedAt || mgr.decidedAt;
        statusExplanation = `Full payment REJECTED by ${approverName}${decDate ? ` on ${formatDateTime(decDate)}` : ''}. Reimbursement is strictly limited to policy allowed limit of Rs. ${formatINR(grandAllow)}.`;
      } else {
        statusExplanation = `Full payment requested. Awaiting special approval from designated Management authority (${approverName}). Full requested amount becomes payable upon approval; otherwise restricted to standard policy allowed limit of Rs. ${formatINR(grandAllow)}.`;
      }
      statusExplanation = statusExplanation.replace(/[₹¹]\s*/g, 'Rs. ');
      const reasonText = fp.reason || claim.fullPaymentReason || 'Special reimbursement justification provided';
      const explColor = isMgmt ? '#166534' : (isOverallApproved ? '#166534' : (isOverallRejected ? '#991b1b' : '#854d0e'));

      drawStructuredCard({
        title: '5. FULL PAYMENT DETAILS',
        badgeText,
        badgeBg,
        badgeBorder,
        badgeColor,
        headerBg: '#f5f3ff',
        headerColor: '#5b21b6',
        borderColor: '#ddd6fe',
        cardBg: '#ffffff',
        rows: [
          {
            label: 'Full Payment Requested:',
            value: `YES (Claim Full Rs. ${formatINR(grandReq)})  •  Standard Policy Allowed: Rs. ${formatINR(grandAllow)}  •  Excess Covered: Rs. ${formatINR(grandExc)}`,
            valueColor: '#0f172a',
          },
          {
            label: 'Reason / Justification:',
            value: `"${reasonText}"`,
            valueColor: '#334155',
            valueFont: 'Helvetica',
          },
          {
            label: 'Approval Status:',
            value: statusExplanation,
            valueColor: explColor,
          },
          ...(fpProofs.length > 0
            ? [
                {
                  label: `Full Payment Proofs (${fpProofs.length}):`,
                  value: fpProofs.map((p) => p.name || 'Supporting Proof').join(', '),
                  valueColor: '#4338ca',
                  valueFont: 'Helvetica',
                },
              ]
            : []),
        ],
      });
    }

    // 1st Approval Card: Reporting Manager Approval
    const stage1Title = isMgmt
      ? '1ST & 2ND APPROVAL: MANAGEMENT EXEMPTION'
      : `1ST APPROVAL: REPORTING MANAGER APPROVAL${isFpRequested ? ' (FULL PAYMENT)' : ''}`;
    const stage1Badge = isMgmt
      ? { text: 'NOT APPLICABLE', bg: '#dcfce7', border: '#86efac', color: '#15803d' }
      : isStep1Approved
      ? { text: 'APPROVED', bg: '#dcfce7', border: '#86efac', color: '#15803d' }
      : isStep1Rejected
      ? { text: 'REJECTED', bg: '#fee2e2', border: '#fca5a5', color: '#b91c1c' }
      : { text: 'AWAITING APPROVAL', bg: '#fef3c7', border: '#fde68a', color: '#b45309' };

    drawStructuredCard({
      title: stage1Title,
      badgeText: stage1Badge.text,
      badgeBg: stage1Badge.bg,
      badgeBorder: stage1Badge.border,
      badgeColor: stage1Badge.color,
      headerBg: '#f8fafc',
      headerColor: '#1e293b',
      borderColor: '#cbd5e1',
      cardBg: '#ffffff',
      rows: [
        {
          label: isMgmt ? 'Approval Requirement:' : 'Reporting Manager:',
          value: approverName,
          valueColor: '#0f172a',
        },
        {
          label: 'Approval Authority:',
          value: appRole,
          valueColor: '#334155',
        },
        {
          label: isMgmt ? 'Approval Decision:' : 'Approval Status:',
          value: appStatus,
          valueColor: appStatusColor,
        },
        {
          label: dateLabel,
          value: dateVal,
          valueColor: '#0f172a',
          valueFont: 'Helvetica',
        },
        ...(isMgmt || remarks
          ? [
              {
                label: 'Decision Remarks:',
                value: isMgmt
                  ? 'Management user claim — approval is not applicable. Claim is forwarded directly to Accounts for verification & disbursement.'
                  : `"${remarks}"`,
                valueColor: isMgmt ? '#166534' : '#334155',
                valueFont: isMgmt ? 'Helvetica' : 'Helvetica-Oblique',
              },
            ]
          : []),
      ],
    });

    // 2nd Approval Card: CFO / Finance Head
    if (showFinSection) {
      const finCode = finCodeRaw ? ` [${finCodeRaw}]` : '';
      const finApproverName = `${finBaseName}${finCode}`;
      const finDesigDept = [finObj?.designation, finObj?.department].filter(Boolean).join(' • ');
      const finRole = finDesigDept ? `CFO / Finance Head (${finDesigDept})` : 'CFO / Finance Head (2nd Approval)';

      let finStatusText = '';
      let finStatusColor = '#64748b';
      let finDateLabel = 'Status Date:';
      let finDateVal = 'After 1st Approval';
      let finBadge = { text: 'PENDING', bg: '#fef3c7', border: '#fde68a', color: '#b45309' };

      if (isFinApproved) {
        finStatusText = 'APPROVED';
        finStatusColor = '#059669';
        finDateLabel = 'Decided On:';
        finDateVal = fin.decidedAt ? formatDateTime(fin.decidedAt) : (fp.decidedAt ? formatDateTime(fp.decidedAt) : 'Approved');
        finBadge = { text: 'APPROVED', bg: '#dcfce7', border: '#86efac', color: '#15803d' };
      } else if (isFinRejected) {
        finStatusText = 'REJECTED';
        finStatusColor = '#dc2626';
        finDateLabel = 'Decided On:';
        finDateVal = fin.decidedAt ? formatDateTime(fin.decidedAt) : 'Rejected';
        finBadge = { text: 'REJECTED', bg: '#fee2e2', border: '#fca5a5', color: '#b91c1c' };
      } else if (isStep1Rejected) {
        finStatusText = 'CANCELLED (1ST APPROVAL REJECTED)';
        finStatusColor = '#dc2626';
        finDateVal = 'Cancelled';
        finBadge = { text: 'CANCELLED', bg: '#fee2e2', border: '#fca5a5', color: '#b91c1c' };
      } else if (fin.status === 'PENDING' || isStep1Approved) {
        finStatusText = 'AWAITING 2ND APPROVAL';
        finStatusColor = '#d97706';
        finDateLabel = fin.requestedAt ? 'Requested On:' : 'Status Date:';
        finDateVal = fin.requestedAt ? formatDateTime(fin.requestedAt) : 'Awaiting CFO Review';
        finBadge = { text: 'AWAITING 2ND APPROVAL', bg: '#fef3c7', border: '#fde68a', color: '#b45309' };
      } else {
        finStatusText = 'PENDING (AFTER 1ST APPROVAL)';
        finStatusColor = '#64748b';
        finDateVal = 'Pending 1st Approval';
      }

      drawStructuredCard({
        title: '2ND APPROVAL: CFO / FINANCE HEAD',
        badgeText: finBadge.text,
        badgeBg: finBadge.bg,
        badgeBorder: finBadge.border,
        badgeColor: finBadge.color,
        headerBg: '#f8fafc',
        headerColor: '#1e293b',
        borderColor: '#cbd5e1',
        cardBg: '#ffffff',
        rows: [
          {
            label: 'CFO / Finance Head:',
            value: finApproverName,
            valueColor: '#0f172a',
          },
          {
            label: 'Approval Authority:',
            value: finRole,
            valueColor: '#334155',
          },
          {
            label: 'Approval Status:',
            value: finStatusText,
            valueColor: finStatusColor,
          },
          {
            label: finDateLabel,
            value: finDateVal,
            valueColor: '#0f172a',
            valueFont: 'Helvetica',
          },
          ...(fin.remarks
            ? [
                {
                  label: 'Decision Remarks:',
                  value: `"${fin.remarks}"`,
                  valueColor: '#334155',
                  valueFont: 'Helvetica-Oblique',
                },
              ]
            : []),
        ],
      });
    }
  }

  // Accounts Admin Approval & Payment Card (Step 1 Verification + Step 2 Payment / Rejection)
  const pDate = formatDateTime(claim.paymentDate || claim.disbursedAt || claim.disbursement?.paymentDate);
  const pRef = claim.paymentReference || claim.utr || claim.disbursement?.paymentReference || 'N/A';
  const pMethod = claim.paymentMethod || claim.disbursement?.paymentMethod || 'Bank Transfer (NEFT/RTGS)';
  const recObj = (typeof claim.disbursement?.recordedBy === 'object' && claim.disbursement?.recordedBy !== null) ? claim.disbursement.recordedBy : null;
  const pRecordedBy = claim.paidByName || claim.disbursement?.recordedByName || recObj?.name || claim.disbursedBy?.name || '';
  const step1Rem = acc.remarks || '';
  const step2Rem = claim.disbursement?.remarks || (claim.accountsRemarks && claim.accountsRemarks !== step1Rem ? claim.accountsRemarks : '') || '';

  const showAccountsCard =
    statusUpper !== 'DRAFT' &&
    Boolean(
      shouldShowAuditBox ||
      hasAccountsApproval ||
      isPaid ||
      hasRejectionRecord ||
      statusUpper === 'SUBMITTED' ||
      statusUpper === 'APPROVAL_PENDING'
    );

  if (showAccountsCard) {
    const accCode = accCodeRaw ? ` [${accCodeRaw}]` : '';
    const accApproverName = `${accBaseName}${accCode}`;
    let accStatusText = '';
    let accStatusColor = '#64748b';
    let accDateLabel = 'Status Date:';
    let accDateVal = 'Awaiting Review';
    let accBadge = { text: 'PENDING', bg: '#fef3c7', border: '#fde68a', color: '#b45309' };

    if (isPaid) {
      accStatusText = 'APPROVED & PAID';
      accStatusColor = '#059669';
      accDateLabel = 'Approved On:';
      accDateVal = acc.approvedAt ? formatDateTime(acc.approvedAt) : pDate;
      accBadge = { text: 'PAID & SETTLED', bg: '#dcfce7', border: '#86efac', color: '#15803d' };
    } else if (isAccountsStep1Approved) {
      accStatusText = 'APPROVED BY ACCOUNTS (AWAITING PAYMENT)';
      accStatusColor = '#059669';
      accDateLabel = 'Approved On:';
      accDateVal = acc.approvedAt ? formatDateTime(acc.approvedAt) : 'Approved';
      accBadge = { text: 'APPROVED (PAYMENT PENDING)', bg: '#dbeafe', border: '#93c5fd', color: '#1d4ed8' };
    } else if (isAccountsRejected || hasRejectionRecord) {
      accStatusText = isAccountsRejected ? 'REJECTED BY ACCOUNTS' : 'CLAIM REJECTED';
      accStatusColor = '#dc2626';
      accDateLabel = 'Rejected On:';
      accDateVal = (rej.rejectedAt || claim.rejectedAt) ? formatDateTime(rej.rejectedAt || claim.rejectedAt) : 'Rejected';
      accBadge = { text: 'REJECTED', bg: '#fee2e2', border: '#fca5a5', color: '#b91c1c' };
    } else if (statusUpper === 'SUBMITTED') {
      accStatusText = 'AWAITING ACCOUNTS STEP 1 APPROVAL';
      accStatusColor = '#d97706';
      accDateVal = 'Pending Accounts Verification';
      accBadge = { text: 'AWAITING ACCOUNTS', bg: '#fef3c7', border: '#fde68a', color: '#b45309' };
    } else {
      accStatusText = 'PENDING (AFTER PRIOR APPROVALS)';
      accStatusColor = '#64748b';
      accDateVal = 'After Prior Approvals';
    }

    const rejObj = (typeof rej.rejectedBy === 'object' && rej.rejectedBy !== null) ? rej.rejectedBy : null;
    const rejBy = rej.rejectedByName || rejObj?.name || claim.rejectedByName || 'Approver / Admin';
    const rejReason = rej.reason || claim.rejectionReason || fin.remarks || mgr.remarks || claim.accountsRemarks || '';
    const rejStage = fin.status === 'REJECTED'
      ? '2nd Approval (CFO / Finance Head)'
      : (mgr.status === 'REJECTED' ? '1st Approval (Reporting Manager)' : 'Accounts Admin Review');

    drawStructuredCard({
      title: 'ACCOUNTS ADMIN APPROVAL (STEP 1 VERIFICATION) & PAYMENT',
      badgeText: accBadge.text,
      badgeBg: accBadge.bg,
      badgeBorder: accBadge.border,
      badgeColor: accBadge.color,
      headerBg: isPaid ? '#f0fdf4' : hasRejectionRecord ? '#fef2f2' : '#f8fafc',
      headerColor: isPaid ? '#166534' : hasRejectionRecord ? '#991b1b' : '#1e293b',
      borderColor: isPaid ? '#bbf7d0' : hasRejectionRecord ? '#fecaca' : '#cbd5e1',
      cardBg: '#ffffff',
      rows: [
        {
          label: 'Accounts Status:',
          value: accStatusText,
          valueColor: accStatusColor,
        },
        {
          label: 'Approved By (Step 1):',
          value: `${accApproverName} — Accounts Admin (Step 1 Approval)`,
          valueColor: '#0f172a',
        },
        {
          label: accDateLabel,
          value: accDateVal,
          valueColor: '#0f172a',
          valueFont: 'Helvetica',
        },
        ...(step1Rem
          ? [
              {
                label: 'Approval Remark (Step 1):',
                value: `"${step1Rem}"`,
                valueColor: '#334155',
                valueFont: 'Helvetica-Oblique',
              },
            ]
          : []),
        ...(isPaid
          ? [
              {
                label: 'Amount Disbursed:',
                value: `Rs. ${formatINR(paidAmt)}   •   Payment Method: ${pMethod}`,
                valueColor: '#15803d',
              },
              {
                label: 'Settlement Date & UTR:',
                value: `${pDate}   •   Transaction Ref / UTR: ${pRef}`,
                valueColor: '#0f172a',
                valueFont: 'Helvetica',
              },
              ...(pRecordedBy
                ? [
                    {
                      label: 'Paid / Recorded By (Step 2):',
                      value: pRecordedBy,
                      valueColor: '#0f172a',
                    },
                  ]
                : []),
              ...(step2Rem
                ? [
                    {
                      label: 'Payment Remark (Step 2):',
                      value: `"${step2Rem}"`,
                      valueColor: '#166534',
                      valueFont: 'Helvetica-Oblique',
                    },
                  ]
                : []),
            ]
          : []),
        ...(hasRejectionRecord
          ? [
              {
                label: 'Rejected By:',
                value: `${rejBy} (${rejStage})`,
                valueColor: '#b91c1c',
              },
              ...(rejReason
                ? [
                    {
                      label: 'Rejection Reason:',
                      value: `"${rejReason}"`,
                      valueColor: '#7f1d1d',
                      valueFont: 'Helvetica-Oblique',
                    },
                  ]
                : []),
            ]
          : []),
      ],
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 6. CALCULATION BREAKDOWN & POLICY EXPLANATION
  // ─────────────────────────────────────────────────────────────
  doc.fontSize(7.5).font('Helvetica');
  const expTextHeight = Math.min(54, doc.heightOfString(explanation, { width: contentWidth - 20, lineGap: 1.5 }));
  const expBoxHeight = 18 + expTextHeight + 8;

  ensureSpace(expBoxHeight + 6);
  const expBoxY = doc.y;
  const expBg = grandExc > 0 ? '#fff1f2' : '#f8fafc';
  const expBorder = grandExc > 0 ? '#fecdd3' : '#cbd5e1';
  const expTitleColor = grandExc > 0 ? '#be123c' : '#4338ca';
  doc.roundedRect(startX, expBoxY, contentWidth, expBoxHeight, 5).fillAndStroke(expBg, expBorder);
  doc
    .fillColor(expTitleColor)
    .fontSize(7.8)
    .font('Helvetica-Bold')
    .text('6. CALCULATION BREAKDOWN & POLICY EXPLANATION', startX + 10, expBoxY + 5);
  doc
    .fillColor('#334155')
    .fontSize(7.5)
    .font('Helvetica')
    .text(explanation, startX + 10, expBoxY + 18, { width: contentWidth - 20, lineGap: 1.5 });

  doc.y = expBoxY + expBoxHeight + 6;

  // ─────────────────────────────────────────────────────────────
  // 7. SERVICE REPORTS (IF PRESENT)
  // ─────────────────────────────────────────────────────────────
  if (Array.isArray(claim.serviceReports) && claim.serviceReports.length > 0) {
    const srNames = claim.serviceReports
      .map((s) => `${s.name || 'Service Report'}${s.size ? ` (${Math.round(s.size / 1024)} KB)` : ''}`)
      .join(', ');
    drawStructuredCard({
      title: `7. SERVICE REPORTS (${claim.serviceReports.length})`,
      badgeText: `${claim.serviceReports.length} Attached`,
      badgeBg: '#f5f3ff',
      badgeBorder: '#ddd6fe',
      badgeColor: '#5b21b6',
      headerBg: '#f8fafc',
      headerColor: '#1e293b',
      borderColor: '#cbd5e1',
      cardBg: '#ffffff',
      rows: [
        {
          label: 'Service Report Documents:',
          value: srNames,
          valueColor: '#0f172a',
          valueFont: 'Helvetica',
        },
      ],
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 8. CLAIM STATUS & APPROVAL JOURNEY (STATUS BOX + NUMBERED STEPPER)
  // ─────────────────────────────────────────────────────────────
  if (statusUpper !== 'DRAFT') {
    const claimNoStr = String(claim.claimNumber || claim.claimId || claim._id || 'N/A');
    const showMgrInJourney = !isMgmt && shouldShowAuditBox;
    const showFinInJourney = showFinSection;

    const overallStatusStr = isPaid
      ? 'PAID'
      : isAccountsStep1Approved
      ? 'APPROVED BY ACCOUNTS (PAYMENT PENDING)'
      : hasRejectionRecord
      ? 'REJECTED'
      : (statusUpper || 'SUBMITTED');

    const mgrSummaryStr = isStep1Approved
      ? `APPROVED by ${mgrBaseName}`
      : isStep1Rejected
      ? `REJECTED by ${mgrBaseName}`
      : `PENDING (${mgrBaseName})`;

    const finSummaryStr = isFinApproved
      ? `APPROVED by ${finBaseName}`
      : isFinRejected
      ? `REJECTED by ${finBaseName}`
      : isStep1Rejected
      ? 'CANCELLED'
      : (fin.status === 'PENDING' || isStep1Approved)
      ? `PENDING (${finBaseName})`
      : 'AFTER 1ST APPROVAL';

    const accSummaryStr = isPaid
      ? 'APPROVED & PAID'
      : isAccountsStep1Approved
      ? `APPROVED by ${accBaseName} (Awaiting Payment)`
      : isAccountsRejected
      ? 'REJECTED BY ACCOUNTS'
      : hasRejectionRecord
      ? 'CANCELLED'
      : statusUpper === 'SUBMITTED'
      ? 'PENDING ACCOUNTS APPROVAL'
      : 'AFTER PRIOR APPROVALS';

    // Build numbered Claim Journey steps matching ExpenseClaimDetailContent.jsx
    const journeySteps = [];
    let stepNum = 1;

    journeySteps.push({
      num: stepNum++,
      title: 'Claim Submitted',
      badge: 'Submitted',
      tone: 'emerald',
      desc: `Submitted by ${applicantName}${applicantCode && applicantCode !== 'N/A' ? ` (${applicantCode})` : ''} on ${appliedDateStr} for Rs. ${formatINR(grandReq)}.`,
    });

    if (showMgrInJourney) {
      const mWho = `${mgrBaseName}${mgrCodeRaw ? ` (${mgrCodeRaw})` : ''}`;
      const mKind = isFpRequested ? 'Full Payment' : isStockPurchase ? 'Stock Purchase' : 'Other Expense';
      const mgrDecidedAtVal = mgr.decidedAt || fp.decidedAt || (isStep1Approved ? (claim.submittedAt || claim.createdAt) : null);
      const mgrDecidedStr = mgrDecidedAtVal ? formatDateTime(mgrDecidedAtVal) : '';
      let mgrRemStr = mgr.remarks || fp.decisionRemarks || '';
      if (!mgrRemStr && isFpRequested && isStep1Approved && fpProofs.length > 0) {
        mgrRemStr = 'Full payment requested with supporting proofs. Routed directly to Accounts for review of proofs and disbursement.';
      }
      journeySteps.push({
        num: stepNum++,
        title: `${showFinInJourney ? '1st Approval: ' : ''}Reporting Manager (${mKind})`,
        badge: isStep1Approved ? 'Approved' : isStep1Rejected ? 'Rejected' : 'Pending',
        tone: isStep1Approved ? 'emerald' : isStep1Rejected ? 'rose' : 'amber',
        desc: isStep1Approved
          ? `Approved by ${mWho}${mgrDecidedStr ? ` on ${mgrDecidedStr}` : ''}.${mgrRemStr ? ` Remark: "${mgrRemStr}"` : ''}`
          : isStep1Rejected
          ? `Rejected by ${mWho}${mgrDecidedStr ? ` on ${mgrDecidedStr}` : ''}.${mgrRemStr ? ` Reason: "${mgrRemStr}"` : ''}`
          : `Awaiting 1st approval from ${mWho}.`,
      });
    }

    if (showFinInJourney) {
      const fWho = `${finBaseName}${finCodeRaw ? ` (${finCodeRaw})` : ''}`;
      const finDecidedStr = fin.decidedAt ? formatDateTime(fin.decidedAt) : '';
      journeySteps.push({
        num: stepNum++,
        title: '2nd Approval: CFO / Finance Head',
        badge: isFinApproved ? 'Approved' : isFinRejected ? 'Rejected' : isStep1Rejected ? 'Cancelled' : isStep1Approved ? 'In Review' : 'Waiting',
        tone: isFinApproved ? 'emerald' : (isFinRejected || isStep1Rejected) ? 'rose' : 'amber',
        desc: isFinApproved
          ? `Approved by ${fWho}${finDecidedStr ? ` on ${finDecidedStr}` : ''}.${fin.remarks ? ` Remark: "${fin.remarks}"` : ''}`
          : isFinRejected
          ? `Rejected by ${fWho}${finDecidedStr ? ` on ${finDecidedStr}` : ''}.${fin.remarks ? ` Reason: "${fin.remarks}"` : ''}`
          : isStep1Rejected
          ? 'Cancelled because 1st Approval (Reporting Manager) was rejected.'
          : isStep1Approved
          ? `Forwarded to ${fWho} for 2nd approval.`
          : 'Will be routed to CFO / Finance Head after 1st Approval.',
      });
    }

    const aWho = `${accBaseName}${accCodeRaw ? ` (${accCodeRaw})` : ''}`;
    const accApprovedAtVal = acc.approvedAt || (isPaid ? (claim.disbursedAt || claim.disbursement?.paymentDate) : null);
    const accApprovedStr = accApprovedAtVal ? formatDateTime(accApprovedAtVal) : '';
    journeySteps.push({
      num: stepNum++,
      title: 'Accounts Admin Approval (Step 1)',
      badge: isAccountsStep1Approved ? 'Approved' : isAccountsRejected ? 'Rejected' : (isStep1Rejected || isFinRejected) ? 'Cancelled' : 'Pending',
      tone: isAccountsStep1Approved ? 'emerald' : (isAccountsRejected || isStep1Rejected || isFinRejected) ? 'rose' : 'amber',
      desc: isAccountsStep1Approved
        ? `Verified & approved by ${aWho}${accApprovedStr ? ` on ${accApprovedStr}` : ''}.${acc.remarks ? ` Remark: "${acc.remarks}"` : ''}`
        : isAccountsRejected
        ? `Rejected by ${rej.rejectedByName || aWho}${rej.rejectedAt ? ` on ${formatDateTime(rej.rejectedAt)}` : ''}.${rej.reason ? ` Reason: "${rej.reason}"` : ''}`
        : (isStep1Rejected || isFinRejected)
        ? 'Cancelled due to prior approval rejection.'
        : statusUpper === 'SUBMITTED'
        ? 'Awaiting Accounts Admin Step 1 verification & approval.'
        : 'Will be routed to Accounts Admin after prior approvals complete.',
    });

    journeySteps.push({
      num: stepNum++,
      title: 'Payment & Settlement (Step 2)',
      badge: isPaid ? 'Paid' : hasRejectionRecord ? 'Cancelled' : isAccountsStep1Approved ? 'Awaiting Payment' : 'Pending',
      tone: isPaid ? 'emerald' : hasRejectionRecord ? 'rose' : 'amber',
      desc: isPaid
        ? `Disbursed Rs. ${formatINR(paidAmt)} via ${pMethod}${pRef && pRef !== 'N/A' ? ` (UTR/Ref: ${pRef})` : ''}${pDate && pDate !== 'N/A' ? ` on ${pDate}` : ''}${pRecordedBy ? ` by ${pRecordedBy}` : ''}.${step2Rem ? ` Remark: "${step2Rem}"` : ''}`
        : hasRejectionRecord
        ? 'Payment cancelled because the claim was rejected.'
        : isAccountsStep1Approved
        ? `Approved for Rs. ${formatINR(payAmt)} — awaiting disbursement & UTR recording by Accounts Admin.`
        : 'Payment will be processed after Accounts Admin Step 1 approval.',
    });

    // Build Status Summary rows matching ExpenseClaimDetailContent.jsx (full-width key-value rows)
    const statusSummaryRows = [
      { label: 'Claim Number:', value: claimNoStr, valueColor: '#0f172a', valueFont: 'Helvetica-Bold' },
      {
        label: 'Overall Status:',
        value: overallStatusStr,
        valueColor: isPaid || isAccountsStep1Approved ? '#059669' : hasRejectionRecord ? '#dc2626' : '#d97706',
        valueFont: 'Helvetica-Bold',
      },
    ];
    if (showMgrInJourney) {
      statusSummaryRows.push({
        label: showFinInJourney ? '1st Approval (Reporting Manager):' : 'Reporting Manager Approval:',
        value: mgrSummaryStr,
        valueColor: isStep1Approved ? '#059669' : isStep1Rejected ? '#dc2626' : '#d97706',
        valueFont: 'Helvetica-Bold',
      });
      if (showFinInJourney) {
        statusSummaryRows.push({
          label: '2nd Approval (CFO / Finance Head):',
          value: finSummaryStr,
          valueColor: isFinApproved ? '#059669' : (isFinRejected || isStep1Rejected) ? '#dc2626' : '#d97706',
          valueFont: 'Helvetica-Bold',
        });
      }
    }
    statusSummaryRows.push({
      label: 'Accounts Admin Approval:',
      value: accSummaryStr,
      valueColor: isPaid || isAccountsStep1Approved ? '#059669' : hasRejectionRecord ? '#dc2626' : '#d97706',
      valueFont: 'Helvetica-Bold',
    });
    statusSummaryRows.push({
      label: 'Payment:',
      value: isPaid ? `PAID (Rs. ${formatINR(paidAmt)})` : 'UNPAID',
      valueColor: isPaid ? '#059669' : '#d97706',
      valueFont: 'Helvetica-Bold',
    });
    statusSummaryRows.push({
      label: 'Applied Date & Time:',
      value: appliedDateStr,
      valueColor: '#0f172a',
      valueFont: 'Helvetica',
    });

    const sumLabelW = 148;
    const sumValW = contentWidth - sumLabelW - 20;
    let summaryH = 4;
    const measuredSummaryRows = statusSummaryRows.map((r) => {
      doc.fontSize(7.2).font('Helvetica-Bold');
      const lH = doc.heightOfString(r.label, { width: sumLabelW - 6 });
      doc.fontSize(7.4).font(r.valueFont || 'Helvetica-Bold');
      const vH = doc.heightOfString(r.value, { width: sumValW, lineGap: 1 });
      const rowH = Math.max(13, Math.max(lH, vH) + 4);
      summaryH += rowH;
      return { ...r, rowH };
    });

    // Measure step heights with generous spacing
    const stepTextW = contentWidth - 40;
    let stepsTotalH = 0;
    const measuredSteps = journeySteps.map((st) => {
      doc.fontSize(7.2).font('Helvetica');
      const dH = Math.max(9.5, doc.heightOfString(st.desc, { width: stepTextW, lineGap: 1.2 }));
      const sH = 11 + dH + 4;
      stepsTotalH += sH;
      return { ...st, dH, sH };
    });

    const journeyHeadH = 16;
    const journeySubHeadH = 14;
    const journeyCardH = journeyHeadH + summaryH + journeySubHeadH + stepsTotalH + 5;

    ensureSpace(journeyCardH + 4.5);
    const jBoxY = doc.y;

    doc.roundedRect(startX, jBoxY, contentWidth, journeyCardH, 5).fillAndStroke('#ffffff', '#cbd5e1');
    doc.roundedRect(startX, jBoxY, contentWidth, journeyHeadH, 5).fill('#f1f5f9');
    doc.rect(startX, jBoxY + journeyHeadH - 5, contentWidth, 5).fill('#f1f5f9');
    doc.rect(startX, jBoxY + journeyHeadH, contentWidth, 0.5).fill('#cbd5e1');
    doc.fillColor('#0f172a').fontSize(7.8).font('Helvetica-Bold').text('8. CLAIM STATUS & APPROVAL JOURNEY', startX + 8, jBoxY + 4.2);

    // Status Summary Full-Width Key-Value Rows
    let sumY = jBoxY + journeyHeadH + 2;
    const sumValX = startX + 8 + sumLabelW;
    measuredSummaryRows.forEach((r, rIdx) => {
      if (rIdx > 0) {
        doc.rect(startX + 8, sumY, contentWidth - 16, 0.4).fill('#f1f5f9');
      }
      doc.fillColor('#64748b').fontSize(7.2).font('Helvetica-Bold').text(r.label, startX + 8, sumY + 2.5, {
        width: sumLabelW - 6,
      });
      doc.fillColor(r.valueColor).fontSize(7.4).font(r.valueFont || 'Helvetica-Bold').text(r.value, sumValX, sumY + 2.3, {
        width: sumValW,
        lineGap: 1,
      });
      sumY += r.rowH;
    });
    sumY += 2;

    // Divider & Claim Journey Stepper Header
    doc.rect(startX + 8, sumY, contentWidth - 16, 0.6).fill('#cbd5e1');
    doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold').text('CLAIM JOURNEY', startX + 8, sumY + 3.5);
    let stepCurY = sumY + journeySubHeadH;

    measuredSteps.forEach((st, idx) => {
      const isLast = idx === measuredSteps.length - 1;
      const dotColor = st.tone === 'emerald' ? '#059669' : st.tone === 'rose' ? '#dc2626' : '#d97706';
      const pillBg = st.tone === 'emerald' ? '#dcfce7' : st.tone === 'rose' ? '#fee2e2' : '#fef3c7';
      const pillTextCol = st.tone === 'emerald' ? '#15803d' : st.tone === 'rose' ? '#b91c1c' : '#b45309';

      const cx = startX + 15;
      const cy = stepCurY + 5;
      if (!isLast) {
        doc.save();
        doc.lineWidth(1).strokeColor('#cbd5e1').moveTo(cx, cy + 5).lineTo(cx, stepCurY + st.sH + 4).stroke();
        doc.restore();
      }
      doc.circle(cx, cy, 5.2).fill(dotColor);
      doc.fillColor('#ffffff').fontSize(6.4).font('Helvetica-Bold').text(String(st.num), cx - 5.2, cy - 2.3, { width: 10.4, align: 'center', lineBreak: false });

      // Step Title
      const tx = startX + 26;
      doc.fillColor('#0f172a').fontSize(7.5).font('Helvetica-Bold').text(st.title, tx, stepCurY + 0.5, { lineBreak: false });
      const titleW = doc.widthOfString(st.title);

      // Step Badge Pill right next to title
      doc.fontSize(6.5).font('Helvetica-Bold');
      const bW = doc.widthOfString(st.badge) + 10;
      const bX = tx + titleW + 8;
      doc.roundedRect(bX, stepCurY - 0.5, bW, 9.5, 2.5).fill(pillBg);
      doc.fillColor(pillTextCol).text(st.badge, bX, stepCurY + 1.3, { width: bW, align: 'center', lineBreak: false });

      // Step Description
      doc.fillColor('#475569').fontSize(7.1).font('Helvetica').text(st.desc, tx, stepCurY + 11, { width: stepTextW, lineGap: 1.2 });

      stepCurY += st.sH;
    });

    doc.y = jBoxY + journeyCardH + 4.5;
  }

  // ─────────────────────────────────────────────────────────────
  // 8A. ATTACHED PROOFS SUMMARY NOTE
  // ─────────────────────────────────────────────────────────────
  doc.fillColor('#64748b').fontSize(7.2).font('Helvetica');
  if (fetchedProofs.length > 0) {
    if (doc.y + 12 <= pageHeight - 28) {
      doc.text(
        `Attached Proofs: ${fetchedProofs.length} proof item(s) verified and appended in this PDF document.`,
        startX,
        doc.y,
        { width: contentWidth, lineBreak: false }
      );
      doc.y += 12;
    }
  } else {
    const noteY = Math.min(doc.y, pageHeight - 32);
    doc.text('Attached Proofs: No external documents attached to this claim.', startX, noteY, { width: contentWidth, lineBreak: false });
  }

  // NOTE: Signatures & Verification boxes have been completely omitted per requirement.

  // ─────────────────────────────────────────────────────────────
  // 8B. ATTACHED PROOFS & PHOTO DOCUMENTATION GALLERY (PAGES 2+)
  // ─────────────────────────────────────────────────────────────
  if (fetchedProofs.length > 0) {
    const maxPageY = pageHeight - margin - 20;
    const contentPagesSoFar = doc.bufferedPageRange().count;
    const totalProofRows = Math.ceil(fetchedProofs.length / 2);

    const drawProofHeader = (isContinuation = false, topY = margin) => {
      const bannerH = isContinuation ? 26 : 32;
      doc.rect(startX, topY, contentWidth, bannerH).fill('#0f172a');
      doc.fillColor('#ffffff').fontSize(isContinuation ? 9.5 : 10.5).font('Helvetica-Bold');
      doc.text(
        isContinuation
          ? 'ATTACHED PROOFS & PHOTO DOCUMENTATION (CONTINUED)'
          : 'ATTACHED PROOFS & PHOTO DOCUMENTATION',
        startX + 12,
        topY + 6
      );
      if (!isContinuation) {
        doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica');
        doc.text(
          `Official Supporting Evidence for Claim #${claim.claimNumber || claim.claimId || claim._id} (${fetchedProofs.length} Item${fetchedProofs.length > 1 ? 's' : ''})`,
          startX + 12,
          topY + 19
        );
      }
      return topY + bannerH + 10;
    };

    const cardW = (contentWidth - 14) / 2; // ~254.6pt
    let curY;
    let cardH = 210;

    // If claim details already flowed onto Page 2+ and there is space below Section 8,
    // render the proof gallery directly below Section 8 on the same page instead of forcing an extra page break.
    const sharedTopY = doc.y + 4;
    const availSharedH = maxPageY - (sharedTopY + 42);
    const rowsToFitOnShared = Math.min(totalProofRows, 2);
    if (contentPagesSoFar > 1 && availSharedH >= rowsToFitOnShared * 108 + (rowsToFitOnShared - 1) * 10) {
      curY = drawProofHeader(false, sharedTopY);
      cardH = Math.min(210, Math.max(108, Math.floor((maxPageY - curY - (rowsToFitOnShared - 1) * 10) / rowsToFitOnShared)));
    } else {
      doc.addPage();
      curY = drawProofHeader(false, margin);
      cardH = 210;
    }

    fetchedProofs.forEach((proof, pIdx) => {
      const colIdx = pIdx % 2;
      // Start a new page if needed (before starting a new row)
      if (colIdx === 0 && pIdx > 0 && curY + cardH > maxPageY) {
        doc.addPage();
        curY = drawProofHeader(true, margin);
        cardH = 210;
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

      // Inner image / preview area
      const innerX = cardX + 6;
      const innerY = cardY + 24;
      const innerW = cardW - 12;
      const innerH = Math.max(78, cardH - 58);
      const boxH = Math.min(92, innerH - 12);
      const boxY = innerY + Math.max(6, Math.floor((innerH - boxH) / 2));

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
          doc.text('Photo Proof Attached (Verified on Portal)', innerX + 4, innerY + Math.floor(innerH / 2) - 6, { width: innerW - 8, align: 'center' });
        }
      } else if (proof.status === 'PDF') {
        doc.roundedRect(innerX + 16, boxY, innerW - 32, boxH, 4).fillAndStroke('#fef2f2', '#fecaca');
        doc.fillColor('#dc2626').fontSize(16).font('Helvetica-Bold').text('PDF', innerX + 16, boxY + 12, { width: innerW - 32, align: 'center' });
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold').text('PDF Document Proof', innerX + 16, boxY + 34, { width: innerW - 32, align: 'center' });
        doc.fillColor('#64748b').fontSize(7).font('Helvetica').text('Official attached file', innerX + 16, boxY + 48, { width: innerW - 32, align: 'center' });
      } else {
        doc.roundedRect(innerX + 16, boxY, innerW - 32, boxH, 4).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.fillColor('#4338ca').fontSize(15).font('Helvetica-Bold').text('DOC', innerX + 16, boxY + 12, { width: innerW - 32, align: 'center' });
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold').text('Attachment Proof', innerX + 16, boxY + 34, { width: innerW - 32, align: 'center' });
        doc.fillColor('#64748b').fontSize(7).font('Helvetica').text('Verified in claim records', innerX + 16, boxY + 48, { width: innerW - 32, align: 'center' });
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
        curY += cardH + 10;
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
      .text('This is an official computer-generated voucher issued by Gatimaan. Confidential.', margin, footerY, { width: contentWidth - 80, lineBreak: false });
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
