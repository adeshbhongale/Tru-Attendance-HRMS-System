const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const rules = require("../services/claimRules");
const foodSvc = require("../services/foodEntitlementService");
const travelSvc = require("../services/travelPolicyService");

// ============================================================================
// Fixtures
// ============================================================================
const TODAY = new Date(Date.UTC(2026, 10, 5)); // 05 Nov 2026
const EMP1 = "64b000000000000000000001";
const EMP2 = "64b000000000000000000002";

const empL1 = {
  _id: EMP1,
  name: "Rohan Sharma",
  employeeIdCode: "TC-101",
  department: "Engineering",
  levelNumber: 1,
  levelRef: { _id: "64b000000000000000000011", name: "L1", levelNumber: 1 },
  gradeCode: "G1",
  role: "employee",
};

const mockPolicy = {
  version: 3,
  conveyanceRates: {
    twoWheeler: 5,
    car: 12,
    eBike: 3,
    eCar: 8,
  },
  relativeStayPercent: 50,
  claimRules: {
    submissionWindowDays: 60,
    maxTripDurationDays: 30,
  },
};

const policyConfig = rules.resolvePolicyConfig(mockPolicy);

const types = {
  FOOD: rules.resolveTypeConfig({ code: "FOOD", name: "Food", category: "FOOD", proofRequired: true }),
  TRAVEL: rules.resolveTypeConfig({ code: "TRAVEL", name: "Travel", category: "TRAVEL", proofRequired: true }),
  CONVEYANCE: rules.resolveTypeConfig({ code: "CONVEYANCE", name: "Local Conveyance", category: "CONVEYANCE" }),
  OTHER: rules.resolveTypeConfig({ code: "OTHER", name: "Other", category: "OTHER" }),
  LODGING: rules.resolveTypeConfig({ code: "LODGING", name: "Lodging", category: "LODGING", proofRequired: true }),
};

const baseEntitlements = [
  { expenseTypeCode: "LODGING", levelNumber: 1, gradeCode: "", cityClass: "A", amount: 2000, status: "active" },
  { expenseTypeCode: "FOOD", levelNumber: 1, gradeCode: "", cityClass: "A", amount: 400, status: "active" },
  { expenseTypeCode: "FOOD", levelNumber: 1, gradeCode: "", cityClass: "B", amount: 300, status: "active" },
  { expenseTypeCode: "FOOD", levelNumber: 1, gradeCode: "", cityClass: "A+", amount: 500, status: "active" },
];

const mockTravelModes = [
  {
    _id: "mode_bus",
    code: "BUS",
    name: "Bus",
    order: 1,
    status: "active",
    subtypes: [
      { _id: "sub_bus_ac", code: "AC_LUXURY_BUS", name: "AC Luxury Bus", workflow: "STANDARD", photosRequired: false, status: "active", order: 1 },
    ],
  },
  {
    _id: "mode_flight",
    code: "FLIGHT",
    name: "Flight",
    order: 2,
    status: "active",
    subtypes: [
      { _id: "sub_flight_eco", code: "FLIGHT_ECONOMY", name: "Flight Economy", workflow: "STANDARD", photosRequired: false, status: "active", order: 1 },
    ],
  },
  {
    _id: "mode_taxi",
    code: "TAXI_AUTO",
    name: "Taxi/Auto",
    order: 3,
    status: "active",
    subtypes: [],
  },
  {
    _id: "mode_train",
    code: "TRAIN",
    name: "Train",
    order: 4,
    status: "active",
    subtypes: [
      { _id: "sub_train_1ac", code: "TRAIN_1AC", name: "Train Ind AC Class", workflow: "STANDARD", photosRequired: false, status: "active", order: 1 },
      { _id: "sub_train_2ac", code: "TRAIN_2AC", name: "Train IInd AC Class", workflow: "STANDARD", photosRequired: false, status: "active", order: 2 },
      { _id: "sub_train_2nd", code: "TRAIN_2ND", name: "Train IInd Class", workflow: "STANDARD", photosRequired: false, status: "active", order: 3 },
    ],
  },
  {
    _id: "mode_2w",
    code: "TWO_WHEELER",
    name: "2-Wheeler",
    order: 5,
    status: "active",
    conveyanceRateKey: "twoWheeler",
    subtypes: [
      { _id: "sub_2w_comp", code: "COMPANY_VEHICLE", name: "Company Vehicle", workflow: "STANDARD", photosRequired: false, status: "active", order: 1 },
      { _id: "sub_2w_own", code: "OWN_VEHICLE", name: "Own Vehicle", workflow: "KM_RATE", photosRequired: true, status: "active", order: 2 },
    ],
  },
  {
    _id: "mode_4w",
    code: "FOUR_WHEELER",
    name: "4-Wheeler",
    order: 6,
    status: "active",
    conveyanceRateKey: "car",
    subtypes: [
      { _id: "sub_4w_comp", code: "COMPANY_VEHICLE", name: "Company Vehicle", workflow: "STANDARD", photosRequired: false, status: "active", order: 1 },
      { _id: "sub_4w_own", code: "OWN_VEHICLE", name: "Own Vehicle", workflow: "KM_RATE", photosRequired: true, status: "active", order: 2 },
    ],
  },
];

// Level 1 Travel Entitlements:
// - Bus (AC Luxury Bus): allowed up to ₹1,500
// - Train: 2nd AC allowed up to ₹2,000, 2nd Class allowed (actuals), 1st AC NOT allowed
// - Taxi/Auto: allowed (actuals)
// - 2-Wheeler: Company Vehicle allowed, Own Vehicle NOT allowed
// - 4-Wheeler: Company Vehicle allowed, Own Vehicle allowed up to ₹1,000
// - Flight: NOT allowed (no row for L1)
const mockTravelEntitlementRows = [
  {
    expenseTypeCode: "TRAVEL",
    status: "active",
    levelNumber: 1,
    gradeCode: "",
    cityClass: "ALL",
    travelModeId: "mode_bus",
    travelModeCode: "BUS",
    allowedSubtypes: [{ subtypeId: "sub_bus_ac", subtypeCode: "AC_LUXURY_BUS", maxAmount: 1500 }],
  },
  {
    expenseTypeCode: "TRAVEL",
    status: "active",
    levelNumber: 1,
    gradeCode: "",
    cityClass: "ALL",
    travelModeId: "mode_train",
    travelModeCode: "TRAIN",
    allowedSubtypes: [
      { subtypeId: "sub_train_2ac", subtypeCode: "TRAIN_2AC", maxAmount: 2000 },
      { subtypeId: "sub_train_2nd", subtypeCode: "TRAIN_2ND", maxAmount: null },
    ],
  },
  {
    expenseTypeCode: "TRAVEL",
    status: "active",
    levelNumber: 1,
    gradeCode: "",
    cityClass: "ALL",
    travelModeId: "mode_taxi",
    travelModeCode: "TAXI_AUTO",
    maxAmount: null,
    allowedSubtypes: [],
  },
  {
    expenseTypeCode: "TRAVEL",
    status: "active",
    levelNumber: 1,
    gradeCode: "",
    cityClass: "ALL",
    travelModeId: "mode_2w",
    travelModeCode: "TWO_WHEELER",
    allowedSubtypes: [{ subtypeId: "sub_2w_comp", subtypeCode: "COMPANY_VEHICLE", maxAmount: null }],
  },
  {
    expenseTypeCode: "TRAVEL",
    status: "active",
    levelNumber: 1,
    gradeCode: "",
    cityClass: "ALL",
    travelModeId: "mode_4w",
    travelModeCode: "FOUR_WHEELER",
    allowedSubtypes: [
      { subtypeId: "sub_4w_comp", subtypeCode: "COMPANY_VEHICLE", maxAmount: null },
      { subtypeId: "sub_4w_own", subtypeCode: "OWN_VEHICLE", maxAmount: 1000 },
    ],
  },
];

const receipt = (name = "Bill_1.jpg") => ({
  name,
  url: `https://res.cloudinary.com/demo/${name}`,
  type: "image/jpeg",
  size: 1000,
});

// ============================================================================
// 13.1 Lodging and Food Duration Tests (Scenarios 1 - 5)
// ============================================================================
describe("13.1 Lodging Nights & Food Inclusive Days", () => {
  it("Scenario 1: 28-10-2026 to 30-10-2026 -> 2 lodging nights and 3 food days", () => {
    const from = rules.parseDateOnly("2026-10-28");
    const to = rules.parseDateOnly("2026-10-30");
    assert.equal(rules.nightsBetween(from, to), 2);
    assert.equal(foodSvc.lodgingNights(from, to), 2);
    assert.equal(rules.daysBetween(from, to), 3);
    assert.equal(foodSvc.foodDays(from, to), 3);
    assert.deepEqual(
      foodSvc.enumerateDates(from, to).map(foodSvc.dateKey),
      ["2026-10-28", "2026-10-29", "2026-10-30"]
    );
  });

  it("Scenario 2: 28-10-2026 to 31-10-2026 -> 3 lodging nights and 4 food days", () => {
    const from = rules.parseDateOnly("2026-10-28");
    const to = rules.parseDateOnly("2026-10-31");
    assert.equal(rules.nightsBetween(from, to), 3);
    assert.equal(foodSvc.lodgingNights(from, to), 3);
    assert.equal(rules.daysBetween(from, to), 4);
    assert.equal(foodSvc.foodDays(from, to), 4);
  });

  it("Scenario 3: Same-day range in Lodging form is rejected by validation (minimum 1 night required)", async () => {
    const from = rules.parseDateOnly("2026-10-28");
    const to = rules.parseDateOnly("2026-10-28");
    assert.equal(rules.nightsBetween(from, to), 0);
    assert.equal(foodSvc.foodDays(from, to), 1);

    const input = rules.normalizeInput({
      claimMode: "LODGING",
      stayType: "IN_HOTEL",
      fromDate: "2026-10-28",
      toDate: "2026-10-28",
      numberOfEmployees: 1,
      employeeIds: [EMP1],
      customerName: "ABC Corp",
      destinationCity: "Pune",
      expenseType: "LODGING",
      requestedAmount: 1000,
      remark: "Same day outstation trip",
      includeFood: true,
      foodEntries: [{ requestedAmount: 350, remark: "Lunch", receipts: [receipt("food.jpg")] }],
      receipts: [receipt("hotel.jpg")],
      serviceReports: [receipt("sr.pdf")],
    });

    const valErrors = rules.validateClaimInput(input, { policyConfig, typeConfig: types.LODGING, today: TODAY });
    assert.ok(valErrors.some((e) => e.field === "toDate" && e.code === "INVALID_DATE_RANGE"));
  });

  it("Scenario 4: End date earlier than start date -> rejected", () => {
    const input = rules.normalizeInput({
      claimMode: "LODGING",
      stayType: "IN_HOTEL",
      fromDate: "2026-10-30",
      toDate: "2026-10-28",
      numberOfEmployees: 1,
      employeeIds: [EMP1],
      customerName: "ABC Corp",
      destinationCity: "Pune",
      expenseType: "LODGING",
      requestedAmount: 2000,
      remark: "Visit",
      receipts: [receipt("hotel.jpg")],
      serviceReports: [receipt("sr.pdf")],
    });
    const errs = rules.validateClaimInput(input, { policyConfig, typeConfig: types.LODGING, today: TODAY });
    assert.ok(errs.some((e) => e.code === "INVALID_DATE_RANGE"));
  });

  it("Scenario 5: Month-end and year-end ranges -> calculated accurately", () => {
    // Oct 30 to Nov 2, 2026 (Oct 30, 31, Nov 1, 2 = 3 lodging nights, 4 food days)
    const oct30 = rules.parseDateOnly("2026-10-30");
    const nov02 = rules.parseDateOnly("2026-11-02");
    assert.equal(rules.nightsBetween(oct30, nov02), 3);
    assert.equal(foodSvc.foodDays(oct30, nov02), 4);

    // Dec 30, 2026 to Jan 2, 2027 (Dec 30, 31, Jan 1, 2 = 3 lodging nights, 4 food days)
    const dec30 = rules.parseDateOnly("2026-12-30");
    const jan02 = rules.parseDateOnly("2027-01-02");
    assert.equal(rules.nightsBetween(dec30, jan02), 3);
    assert.equal(foodSvc.foodDays(dec30, jan02), 4);
  });
});

// ============================================================================
// 13.2 Accommodation Tests (Scenarios 6 - 8)
// ============================================================================
describe("13.2 Lodging Accommodation: In Hotel vs At Relative + Food", () => {
  const threeDaysContext = {
    daily: {
      [EMP1]: [
        { date: rules.parseDateOnly("2026-10-28"), dailyLimit: 400, priorConsumed: 0 },
        { date: rules.parseDateOnly("2026-10-29"), dailyLimit: 400, priorConsumed: 0 },
        { date: rules.parseDateOnly("2026-10-30"), dailyLimit: 400, priorConsumed: 0 },
      ],
    },
  };

  it("Scenario 6: Hotel accommodation with 2 nights and 3 food days (plus multiplier food entries)", async () => {
    const input = rules.normalizeInput({
      claimMode: "LODGING",
      stayType: "IN_HOTEL",
      fromDate: "2026-10-28",
      toDate: "2026-10-30",
      numberOfEmployees: 1,
      employeeIds: [EMP1],
      customerName: "Client A",
      destinationCity: "Pune",
      expenseType: "LODGING",
      requestedAmount: 3800, // 2 nights * ₹2,000 = ₹4,000 limit
      remark: "Hotel stay",
      receipts: [receipt("hotel.jpg")],
      serviceReports: [receipt("sr.pdf")],
      includeFood: true,
      foodEntries: [
        { requestedAmount: 500, remark: "Meals 1", receipts: [receipt("f1.jpg")] },
        { requestedAmount: 600, remark: "Meals 2", receipts: [receipt("f2.jpg")] },
      ],
    });

    const calc = await rules.calculateAmounts({
      input,
      typeConfig: types.LODGING,
      employees: [empL1],
      policy: mockPolicy,
      entitlements: baseEntitlements,
      destinationClass: "A",
      actor: EMP1,
      foodContext: threeDaysContext,
    });

    assert.equal(calc.lodgingNights, 2);
    assert.equal(calc.foodDays, 3);
    assert.equal(calc.lodgingSummary.policyLimit, 4000);
    assert.equal(calc.lodgingSummary.allowed, 3800);
    assert.equal(calc.lodgingSummary.excess, 0);

    assert.equal(calc.foodSummary.entitlement, 1200);
    assert.equal(calc.foodSummary.requested, 1100);
    assert.equal(calc.foodSummary.allowed, 1100);
    assert.equal(calc.foodSummary.excess, 0);
    assert.equal(calc.grandAllowed, 4900);
  });

  it("Scenario 7: At Relative accommodation with 2 nights and 3 food days", async () => {
    const input = rules.normalizeInput({
      claimMode: "LODGING",
      stayType: "WITH_RELATIVE",
      fromDate: "2026-10-28",
      toDate: "2026-10-30",
      numberOfEmployees: 1,
      employeeIds: [EMP1],
      customerName: "Client A",
      destinationCity: "Pune",
      expenseType: "LODGING",
      requestedAmount: 0,
      remark: "Stayed at relative",
      receipts: [],
      serviceReports: [receipt("sr.pdf")],
      includeFood: true,
      foodEntries: [{ requestedAmount: 1350, remark: "3 days meals", receipts: [receipt("f1.jpg")] }],
    });

    const calc = await rules.calculateAmounts({
      input,
      typeConfig: types.LODGING,
      employees: [empL1],
      policy: mockPolicy,
      entitlements: baseEntitlements,
      destinationClass: "A",
      actor: EMP1,
      foodContext: threeDaysContext,
    });

    // 2 nights * ₹2,000 * 50% = ₹2,000 lodging allowed; 3 food days * ₹400 = ₹1,200 food allowed (₹150 excess)
    assert.equal(calc.lodgingNights, 2);
    assert.equal(calc.foodDays, 3);
    assert.equal(calc.lodgingSummary.allowed, 2000);
    assert.equal(calc.foodSummary.allowed, 1200);
    assert.equal(calc.foodSummary.excess, 150);
    assert.equal(calc.grandAllowed, 3200);
    assert.equal(calc.grandExcess, 150);
  });

  it("Scenario 8: Accommodation-specific document and allowance rules", () => {
    // In Hotel without hotel bill -> fails validation
    const hotelInput = rules.normalizeInput({
      claimMode: "LODGING",
      stayType: "IN_HOTEL",
      fromDate: "2026-10-28",
      toDate: "2026-10-30",
      numberOfEmployees: 1,
      employeeIds: [EMP1],
      customerName: "Client A",
      destinationCity: "Pune",
      expenseType: "LODGING",
      requestedAmount: 3000,
      remark: "Hotel stay",
      receipts: [],
      serviceReports: [receipt("sr.pdf")],
    });
    const hotelErrs = rules.validateClaimInput(hotelInput, { policyConfig, typeConfig: types.LODGING, today: TODAY });
    assert.ok(hotelErrs.some((e) => e.code === "RECEIPT_REQUIRED"));

    // With Relative without hotel bill or lodging amount -> passes validation
    const relInput = rules.normalizeInput({
      claimMode: "LODGING",
      stayType: "WITH_RELATIVE",
      fromDate: "2026-10-28",
      toDate: "2026-10-30",
      numberOfEmployees: 1,
      employeeIds: [EMP1],
      customerName: "Client A",
      destinationCity: "Pune",
      expenseType: "LODGING",
      requestedAmount: 0,
      remark: "Relative stay",
      receipts: [],
      serviceReports: [receipt("sr.pdf")],
    });
    const relErrs = rules.validateClaimInput(relInput, { policyConfig, typeConfig: types.LODGING, today: TODAY });
    assert.deepEqual(relErrs, []);
  });
});

// ============================================================================
// 13.3 Duplicate Food Allowance Prevention Tests (Scenarios 9 - 18)
// ============================================================================
describe("13.3 Shared Date-Wise Food Entitlement & Duplicate Prevention", () => {
  it("Scenario 9: Normal Food Claim for 29-10-2026 (₹400) followed by Lodging + Food for 28-10 to 30-10 -> ₹1,200 - ₹400 = ₹800 remaining", async () => {
    const input = rules.normalizeInput({
      claimMode: "LODGING",
      stayType: "IN_HOTEL",
      fromDate: "2026-10-28",
      toDate: "2026-10-30",
      numberOfEmployees: 1,
      employeeIds: [EMP1],
      customerName: "Client A",
      destinationCity: "Pune",
      expenseType: "LODGING",
      requestedAmount: 3500,
      remark: "Visit",
      receipts: [receipt("hotel.jpg")],
      serviceReports: [receipt("sr.pdf")],
      includeFood: true,
      foodEntries: [{ requestedAmount: 1000, remark: "Meals", receipts: [receipt("food.jpg")] }],
    });

    const calc = await rules.calculateAmounts({
      input,
      typeConfig: types.LODGING,
      employees: [empL1],
      policy: mockPolicy,
      entitlements: baseEntitlements,
      destinationClass: "A",
      actor: EMP1,
      foodContext: {
        daily: {
          [EMP1]: [
            { date: rules.parseDateOnly("2026-10-28"), dailyLimit: 400, priorConsumed: 0 },
            { date: rules.parseDateOnly("2026-10-29"), dailyLimit: 400, priorConsumed: 400 },
            { date: rules.parseDateOnly("2026-10-30"), dailyLimit: 400, priorConsumed: 0 },
          ],
        },
      },
    });

    assert.equal(calc.foodSummary.entitlement, 1200);
    assert.equal(calc.foodSummary.priorConsumed, 400);
    assert.equal(calc.foodSummary.remainingBefore, 800);
    assert.equal(calc.foodSummary.allowed, 800);
    assert.equal(calc.foodSummary.excess, 200);
  });

  it("Scenario 10: Lodging + Food for 28-10-2026 to 30-10-2026 followed by Normal Food Claim for 29-10-2026", async () => {
    // 29-10-2026 already has ₹400 consumed by the Lodging + Food claim
    const input = rules.normalizeInput({
      claimMode: "NORMAL",
      claimDate: "2026-10-29",
      numberOfEmployees: 1,
      employeeIds: [EMP1],
      customerName: "Client A",
      destinationCity: "Pune",
      expenseType: "FOOD",
      requestedAmount: 400,
      remark: "Dinner",
      entries: [{ expenseType: "FOOD", requestedAmount: 400, remark: "Dinner", receipts: [receipt("f.jpg")] }],
    });

    const calc = await rules.calculateAmounts({
      input,
      typeConfig: types.FOOD,
      employees: [empL1],
      policy: mockPolicy,
      entitlements: baseEntitlements,
      destinationClass: "A",
      actor: EMP1,
      foodContext: { normalPrior: { [EMP1]: 400 } },
    });

    assert.equal(calc.grandRequested, 400);
    assert.equal(calc.grandAllowed, 0);
    assert.equal(calc.grandExcess, 400);
  });

  it("Scenario 11: Partial food claim on an overlapping date (₹250 of ₹400) leaves ₹150 remaining on that date", () => {
    const alloc = foodSvc.allocateFood({
      requested: 1000,
      employees: [
        {
          rows: [
            { date: rules.parseDateOnly("2026-10-28"), dailyLimit: 400, priorConsumed: 0 },
            { date: rules.parseDateOnly("2026-10-29"), dailyLimit: 400, priorConsumed: 250 },
            { date: rules.parseDateOnly("2026-10-30"), dailyLimit: 400, priorConsumed: 0 },
          ],
        },
      ],
    });

    // 400 + 150 + 400 = 950 remaining
    assert.equal(alloc.entitlement, 1200);
    assert.equal(alloc.priorConsumed, 250);
    assert.equal(alloc.remainingBefore, 950);
    assert.equal(alloc.allowed, 950);
    assert.equal(alloc.excess, 50);
  });

  it("Scenario 12: Full food claim on an overlapping date leaves ₹0 remaining on that date", () => {
    const alloc = foodSvc.allocateFood({
      requested: 300,
      employees: [
        {
          rows: [{ date: rules.parseDateOnly("2026-10-29"), dailyLimit: 400, priorConsumed: 400 }],
        },
      ],
    });
    assert.equal(alloc.remainingBefore, 0);
    assert.equal(alloc.allowed, 0);
    assert.equal(alloc.excess, 300);
  });

  it("Scenario 13: Multiple overlapping dates across multiple claims", () => {
    const alloc = foodSvc.allocateFood({
      requested: 800,
      employees: [
        {
          rows: [
            { date: rules.parseDateOnly("2026-10-28"), dailyLimit: 400, priorConsumed: 200 },
            { date: rules.parseDateOnly("2026-10-29"), dailyLimit: 400, priorConsumed: 0 },
            { date: rules.parseDateOnly("2026-10-30"), dailyLimit: 400, priorConsumed: 400 },
          ],
        },
      ],
    });
    assert.equal(alloc.entitlement, 1200);
    assert.equal(alloc.priorConsumed, 600);
    assert.equal(alloc.remainingBefore, 600);
    assert.equal(alloc.allowed, 600);
    assert.equal(alloc.excess, 200);
  });

  it("Scenario 14 & 15: Rejected and Cancelled claims are in NON_CONSUMING_STATUSES and release entitlement", () => {
    for (const st of ["REJECTED", "HR_REJECTED", "ACCOUNTS_REJECTED", "CANCELLED", "DRAFT", "RETURNED"]) {
      assert.ok(foodSvc.NON_CONSUMING_STATUSES.includes(st), `${st} must not consume food entitlement`);
    }
  });

  it("Scenario 16: Editing an existing food claim allocates entries without double-counting", () => {
    const entries = foodSvc.allocateEntries(
      [
        { requestedAmount: 500, remark: "Entry 1" },
        { requestedAmount: 500, remark: "Entry 2" },
      ],
      800
    );
    assert.equal(entries[0].allowedAmount, 500);
    assert.equal(entries[0].excessAmount, 0);
    assert.equal(entries[1].allowedAmount, 300);
    assert.equal(entries[1].excessAmount, 200);
  });

  it("Scenario 17: Concurrent overlapping food submissions cannot exceed daily cap when serialized", async () => {
    let consumedOn29 = 0;
    let lockChain = Promise.resolve();
    const withSimulatedEmployeeLock = (fn) => {
      const next = lockChain.then(fn);
      lockChain = next.catch(() => {});
      return next;
    };

    const submitClaim = (amount) =>
      withSimulatedEmployeeLock(async () => {
        await new Promise((r) => setTimeout(r, 20));
        const res = foodSvc.allocateFood({
          requested: amount,
          employees: [{ rows: [{ date: rules.parseDateOnly("2026-10-29"), dailyLimit: 400, priorConsumed: consumedOn29 }] }],
        });
        consumedOn29 += res.allowed;
        return res;
      });

    const [r1, r2] = await Promise.all([submitClaim(300), submitClaim(300)]);
    assert.equal(r1.allowed + r2.allowed, 400);
    assert.equal(r1.excess + r2.excess, 200);
  });

  it("Scenario 18: Date range with different daily food rates across dates", () => {
    const alloc = foodSvc.allocateFood({
      requested: 1000,
      employees: [
        {
          rows: [
            { date: rules.parseDateOnly("2026-10-28"), dailyLimit: 300, priorConsumed: 0 },   // Class B
            { date: rules.parseDateOnly("2026-10-29"), dailyLimit: 400, priorConsumed: 250 }, // Class A
            { date: rules.parseDateOnly("2026-10-30"), dailyLimit: 500, priorConsumed: 0 },   // Class A+
          ],
        },
      ],
    });
    assert.equal(alloc.entitlement, 1200); // 300 + 400 + 500
    assert.equal(alloc.priorConsumed, 250);
    assert.equal(alloc.remainingBefore, 950); // 300 + 150 + 500
    assert.equal(alloc.allowed, 950);
    assert.equal(alloc.excess, 50);
  });
});

// ============================================================================
// 13.4 Travel Mode and Subtype Tests (Scenarios 19 - 29)
// ============================================================================
describe("13.4 Dynamic Travel Modes, Subtypes & Vehicle Workflows", () => {
  it("Scenario 19: Bus -> AC Luxury Bus", () => {
    const entry = { expenseType: "TRAVEL", travelModeId: "mode_bus", travelSubtypeId: "sub_bus_ac", requestedAmount: 1200 };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(entry.travel.modeName, "Bus");
    assert.equal(entry.travel.subtypeName, "AC Luxury Bus");
    assert.equal(entry.travel.workflow, "STANDARD");
  });

  it("Scenario 20: Flight -> Flight Economy", () => {
    const entry = { expenseType: "TRAVEL", travelModeId: "mode_flight", travelSubtypeId: "sub_flight_eco", requestedAmount: 4800 };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(entry.travel.modeName, "Flight");
    assert.equal(entry.travel.subtypeName, "Flight Economy");
    assert.equal(entry.travel.workflow, "STANDARD");
  });

  it("Scenario 21: Taxi/Auto -> no subtype required, normal travel fields shown", () => {
    const entry = { expenseType: "TRAVEL", travelModeId: "mode_taxi", requestedAmount: 350 };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(entry.travel.modeName, "Taxi/Auto");
    assert.equal(entry.travel.subtypeId, null);
    assert.equal(entry.travel.workflow, "STANDARD");
  });

  it("Scenario 22: Train -> Train Ind AC Class, Train IInd AC Class, Train IInd Class", () => {
    const serialized = travelSvc.serializeModes(mockTravelModes, mockPolicy);
    const train = serialized.find((m) => m.code === "TRAIN");
    assert.deepEqual(
      train.subtypes.map((s) => s.name),
      ["Train Ind AC Class", "Train IInd AC Class", "Train IInd Class"]
    );
  });

  it("Scenario 23: Admin-added Train subtype appears in serialized claim form modes", () => {
    const customModes = mockTravelModes.map((m) =>
      m.code === "TRAIN"
        ? {
            ...m,
            subtypes: [
              ...m.subtypes,
              { _id: "sub_train_3ac", code: "TRAIN_3AC", name: "Train IIIrd AC Class", workflow: "STANDARD", status: "active", order: 4 },
            ],
          }
        : m
    );
    const serialized = travelSvc.serializeModes(customModes, mockPolicy);
    const train = serialized.find((m) => m.code === "TRAIN");
    assert.ok(train.subtypes.some((s) => s.code === "TRAIN_3AC" && s.name === "Train IIIrd AC Class"));
  });

  it("Scenario 24: Deactivated subtype does not appear for new claims while historical claims keep snapshot", () => {
    const customModes = mockTravelModes.map((m) =>
      m.code === "TRAIN"
        ? {
            ...m,
            subtypes: m.subtypes.map((s) => (s.code === "TRAIN_1AC" ? { ...s, status: "inactive" } : s)),
          }
        : m
    );
    const serialized = travelSvc.serializeModes(customModes, mockPolicy);
    const train = serialized.find((m) => m.code === "TRAIN");
    assert.equal(train.subtypes.some((s) => s.code === "TRAIN_1AC"), false);

    // Attempting to submit deactivated subtype fails validation
    const entry = { expenseType: "TRAVEL", travelModeId: "mode_train", travelSubtypeId: "sub_train_1ac", requestedAmount: 2500 };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: customModes, policy: mockPolicy });
    assert.ok(errs.some((e) => e.code === "TRAVEL_SUBTYPE_INVALID"));
  });

  it("Scenario 25: 2-Wheeler -> Company Vehicle uses normal travel fields (STANDARD workflow)", () => {
    const entry = { expenseType: "TRAVEL", travelModeId: "mode_2w", travelSubtypeId: "sub_2w_comp", requestedAmount: 300 };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(entry.travelWorkflow, "STANDARD");
    assert.equal(entry.distanceKm, 0);
  });

  it("Scenario 26: 2-Wheeler -> Own Vehicle uses KM and odometer photo fields (KM_RATE workflow)", () => {
    const entry = {
      expenseType: "TRAVEL",
      travelModeId: "mode_2w",
      travelSubtypeId: "sub_2w_own",
      startKm: 1000,
      endKm: 1040,
      numberPlatePhotos: [receipt("np.jpg")],
      startKmPhotos: [receipt("sk.jpg")],
      endKmPhotos: [receipt("ek.jpg")],
    };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(entry.travelWorkflow, "KM_RATE");
    assert.equal(entry.distanceKm, 40);
    assert.equal(entry.travel.ratePerKm, 5);
    assert.equal(entry.requestedAmount, 200);
  });

  it("Scenario 27: 4-Wheeler -> Company Vehicle uses normal travel fields (STANDARD workflow)", () => {
    const entry = { expenseType: "TRAVEL", travelModeId: "mode_4w", travelSubtypeId: "sub_4w_comp", requestedAmount: 850 };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(entry.travelWorkflow, "STANDARD");
  });

  it("Scenario 28: 4-Wheeler -> Own Vehicle uses KM and odometer photo fields (KM_RATE workflow)", () => {
    const entry = {
      expenseType: "TRAVEL",
      travelModeId: "mode_4w",
      travelSubtypeId: "sub_4w_own",
      startKm: 25000,
      endKm: 25050,
      numberPlatePhotos: [receipt("np.jpg")],
      startKmPhotos: [receipt("sk.jpg")],
      endKmPhotos: [receipt("ek.jpg")],
    };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(entry.travelWorkflow, "KM_RATE");
    assert.equal(entry.distanceKm, 50);
    assert.equal(entry.travel.ratePerKm, 12);
    assert.equal(entry.requestedAmount, 600);
  });

  it("Scenario 29: End KM <= Start KM or missing odometer/vehicle photos -> rejected", () => {
    const badKmEntry = {
      expenseType: "TRAVEL",
      travelModeId: "mode_2w",
      travelSubtypeId: "sub_2w_own",
      startKm: 1050,
      endKm: 1050,
      numberPlatePhotos: [receipt("np.jpg")],
      startKmPhotos: [receipt("sk.jpg")],
      endKmPhotos: [receipt("ek.jpg")],
    };
    const errs1 = travelSvc.resolveTravelEntry(badKmEntry, { modes: mockTravelModes, policy: mockPolicy });
    assert.ok(errs1.some((e) => e.code === "DISTANCE_INVALID"));

    const missingPhotoEntry = {
      expenseType: "TRAVEL",
      travelModeId: "mode_2w",
      travelSubtypeId: "sub_2w_own",
      startKm: 1000,
      endKm: 1020,
      numberPlatePhotos: [receipt("np.jpg")],
      startKmPhotos: [receipt("sk.jpg")],
      endKmPhotos: [],
    };
    const errs2 = travelSvc.resolveTravelEntry(missingPhotoEntry, { modes: mockTravelModes, policy: mockPolicy });
    assert.ok(errs2.some((e) => e.code === "END_KM_PHOTO_REQUIRED"));
  });
});

// ============================================================================
// 13.5 Level Entitlements, Excess & Security Tests (Scenarios 30 - 36)
// ============================================================================
describe("13.5 Level Entitlements, Excess Calculation & Tamper Protection", () => {
  it("Scenario 30: Entitled travel subtype within limit -> full amount allowed, excess = 0", () => {
    const ent = travelSvc.resolveTravelEntitlement(mockTravelEntitlementRows, {
      levelNumber: 1,
      gradeCode: "G1",
      cityClass: "A",
      modeId: "mode_train",
      modeCode: "TRAIN",
      subtypeId: "sub_train_2ac", // ₹2,000 cap
    });
    const split = travelSvc.applyTravelEntitlement(1650, ent, { label: "Train — Train IInd AC Class", levelNumber: 1 });
    assert.equal(split.allowed, 1650);
    assert.equal(split.excess, 0);
    assert.equal(split.status, "ENTITLED");
  });

  it("Scenario 31: Entitled travel subtype above limit -> allowed = limit, excess = claimed - limit", () => {
    const ent = travelSvc.resolveTravelEntitlement(mockTravelEntitlementRows, {
      levelNumber: 1,
      gradeCode: "G1",
      cityClass: "A",
      modeId: "mode_train",
      modeCode: "TRAIN",
      subtypeId: "sub_train_2ac", // ₹2,000 cap
    });
    const split = travelSvc.applyTravelEntitlement(2450, ent, { label: "Train — Train IInd AC Class", levelNumber: 1 });
    assert.equal(split.allowed, 2000);
    assert.equal(split.excess, 450);
    assert.equal(split.status, "PARTIAL");
  });

  it("Scenario 32: Disallowed travel subtype (Flight Economy for L1) -> allowed = 0, excess = claimed", () => {
    const ent = travelSvc.resolveTravelEntitlement(mockTravelEntitlementRows, {
      levelNumber: 1,
      gradeCode: "G1",
      cityClass: "A",
      modeId: "mode_flight",
      modeCode: "FLIGHT",
      subtypeId: "sub_flight_eco",
    });
    assert.equal(ent.entitled, false);
    const split = travelSvc.applyTravelEntitlement(5200, ent, { label: "Flight — Flight Economy", levelNumber: 1 });
    assert.equal(split.allowed, 0);
    assert.equal(split.excess, 5200);
    assert.equal(split.status, "NOT_ENTITLED");
  });

  it("Scenario 33: Disallowed Own Vehicle when only Company Vehicle is entitled -> allowed = 0, excess = auto-calculated KM amount", () => {
    const entry = {
      expenseType: "TRAVEL",
      travelModeId: "mode_2w",
      travelSubtypeId: "sub_2w_own",
      startKm: 500,
      endKm: 560, // 60 km * ₹5/km = ₹300
      numberPlatePhotos: [receipt("np.jpg")],
      startKmPhotos: [receipt("sk.jpg")],
      endKmPhotos: [receipt("ek.jpg")],
    };
    const errs = travelSvc.resolveTravelEntry(entry, { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(entry.requestedAmount, 300);

    const ent = travelSvc.resolveTravelEntitlement(mockTravelEntitlementRows, {
      levelNumber: 1,
      gradeCode: "G1",
      cityClass: "A",
      modeId: "mode_2w",
      modeCode: "TWO_WHEELER",
      subtypeId: "sub_2w_own",
    });
    assert.equal(ent.entitled, false);
    const split = travelSvc.applyTravelEntitlement(entry.requestedAmount, ent, { label: "2-Wheeler — Own Vehicle", levelNumber: 1 });
    assert.equal(split.allowed, 0);
    assert.equal(split.excess, 300);
    assert.equal(split.status, "NOT_ENTITLED");
  });

  it("Scenario 34 & 35: Admin entitlement update applies to new claims while historical claim snapshot remains intact", () => {
    // 1. Historical claim calculated under old entitlement (Flight disallowed)
    const oldEnt = travelSvc.resolveTravelEntitlement(mockTravelEntitlementRows, {
      levelNumber: 1,
      gradeCode: "G1",
      cityClass: "A",
      modeId: "mode_flight",
      modeCode: "FLIGHT",
      subtypeId: "sub_flight_eco",
    });
    const historicalSnapshot = JSON.parse(
      JSON.stringify(travelSvc.applyTravelEntitlement(5000, oldEnt, { label: "Flight — Flight Economy", levelNumber: 1 }))
    );

    // 2. Admin updates L1 entitlement to allow Flight Economy up to ₹6,000
    const updatedRows = [
      ...mockTravelEntitlementRows,
      {
        expenseTypeCode: "TRAVEL",
        status: "active",
        levelNumber: 1,
        gradeCode: "",
        cityClass: "ALL",
        travelModeId: "mode_flight",
        travelModeCode: "FLIGHT",
        allowedSubtypes: [{ subtypeId: "sub_flight_eco", subtypeCode: "FLIGHT_ECONOMY", maxAmount: 6000 }],
      },
    ];
    const newEnt = travelSvc.resolveTravelEntitlement(updatedRows, {
      levelNumber: 1,
      gradeCode: "G1",
      cityClass: "A",
      modeId: "mode_flight",
      modeCode: "FLIGHT",
      subtypeId: "sub_flight_eco",
    });
    const newCalc = travelSvc.applyTravelEntitlement(5000, newEnt, { label: "Flight — Flight Economy", levelNumber: 1 });

    assert.equal(newCalc.allowed, 5000);
    assert.equal(newCalc.excess, 0);
    assert.equal(historicalSnapshot.allowed, 0);
    assert.equal(historicalSnapshot.excess, 5000);
  });

  it("Scenario 36: Backend rejects or overrides manipulated frontend values (tampered distanceKm and requestedAmount)", () => {
    const tamperedEntry = {
      expenseType: "TRAVEL",
      travelModeId: "mode_2w",
      travelSubtypeId: "sub_2w_own",
      startKm: 100,
      endKm: 110, // actual distance = 10 km, actual amount = 10 * ₹5 = ₹50
      distanceKm: 500, // tampered!
      requestedAmount: 50000, // tampered!
      numberPlatePhotos: [receipt("np.jpg")],
      startKmPhotos: [receipt("sk.jpg")],
      endKmPhotos: [receipt("ek.jpg")],
    };
    const errs = travelSvc.resolveTravelEntry(tamperedEntry, { modes: mockTravelModes, policy: mockPolicy });
    assert.ok(errs.some((e) => e.code === "DISTANCE_MISMATCH"));
    assert.ok(errs.some((e) => e.code === "AMOUNT_MISMATCH"));
    // Even after flagging the mismatch, the server overwrites the entry with the authoritative values
    assert.equal(tamperedEntry.distanceKm, 10);
    assert.equal(tamperedEntry.requestedAmount, 50);
  });

  it("Scenario 37: Date-based already-claimed submission rule applies ONLY to Food and Lodging, never to Travel, Local Conveyance, or Other", async () => {
    const ExpenseClaim = require("../models/ExpenseClaim");
    const Attendance = require("../../../../models/Attendance");
    const origCount = ExpenseClaim.countDocuments;
    const origFindOne = ExpenseClaim.findOne;
    const origAttFind = Attendance.find;
    try {
      // Simulate existing claims on the same date / overlapping range
      ExpenseClaim.countDocuments = async () => 1;
      ExpenseClaim.findOne = () => ({
        select: () => ({
          lean: async () => ({
            claimNumber: "EXP-0001",
            fromDate: rules.parseDateOnly("2026-10-28"),
            toDate: rules.parseDateOnly("2026-10-30"),
          }),
        }),
      });
      Attendance.find = () => ({
        sort: () => ({
          limit: () => ({
            select: () => ({
              lean: async () => [],
            }),
          }),
        }),
      });

      const dateInput = {
        claimMode: "NORMAL",
        claimDate: rules.parseDateOnly("2026-10-29"),
      };

      // TRAVEL, CONVEYANCE, and OTHER must NEVER be blocked by same-date already-claimed checks
      for (const nonDateLimited of ["TRAVEL", "CONVEYANCE", "OTHER"]) {
        const cfg = rules.resolveTypeConfig({ code: nonDateLimited, name: nonDateLimited, category: nonDateLimited, sameDateLimit: 1 });
        assert.equal(cfg.sameDateLimit, 0);
        const res = await rules.evaluateBusinessRules({
          companyId: EMP1,
          input: dateInput,
          typeConfig: cfg,
          employees: [empL1],
          policyConfig,
          actor: EMP1,
        });
        assert.deepEqual(res.errors, []);
      }

      // FOOD must still enforce same-date already-claimed check
      const foodRes = await rules.evaluateBusinessRules({
        companyId: EMP1,
        input: dateInput,
        typeConfig: types.FOOD,
        employees: [empL1],
        policyConfig,
        actor: EMP1,
      });
      assert.ok(foodRes.errors.some((e) => e.code === "DUPLICATE_FOOD"));

      // LODGING must still enforce night-overlap check
      const lodgingRes = await rules.evaluateBusinessRules({
        companyId: EMP1,
        input: {
          claimMode: "LODGING",
          fromDate: rules.parseDateOnly("2026-10-28"),
          toDate: rules.parseDateOnly("2026-10-30"),
        },
        typeConfig: types.LODGING,
        employees: [empL1],
        policyConfig,
        actor: EMP1,
      });
      assert.ok(lodgingRes.errors.some((e) => e.code === "LODGING_OVERLAP"));
    } finally {
      ExpenseClaim.countDocuments = origCount;
      ExpenseClaim.findOne = origFindOne;
      Attendance.find = origAttFind;
    }
  });

  it("Scenario 38: 4 Separate Vehicle Travel Modes (2W Petrol 3.5, 2W EV 1, 4W Petrol 5, 4W EV 1.75) each have Company Vehicle (STANDARD) and Own Vehicle (KM_RATE) subtypes without duplicate keys", () => {
    const { DEFAULT_TRAVEL_MODES, CONVEYANCE_RATES } = require("../services/seedExpenseMasters");
    const stdPolicy = { conveyanceRates: CONVEYANCE_RATES };
    const modesWithIds = DEFAULT_TRAVEL_MODES.map((m, mi) => ({
      ...m,
      _id: `mode_${mi}`,
      status: "active",
      subtypes: (m.subtypes || []).map((s, si) => ({ ...s, _id: `sub_${mi}_${si}`, status: "active" })),
    }));

    const serialized = travelSvc.serializeModes(modesWithIds, stdPolicy);
    const vehicleModeCodes = ["TWO_WHEELER_PETROL", "TWO_WHEELER_EV", "FOUR_WHEELER_PETROL", "FOUR_WHEELER_EV"];
    for (const vCode of vehicleModeCodes) {
      const m = serialized.find((x) => x.code === vCode);
      assert.ok(m, `Travel mode ${vCode} must exist`);
      assert.deepEqual(
        m.subtypes.map((s) => s.code),
        ["COMPANY_VEHICLE", "OWN_VEHICLE"],
        `${vCode} must have exactly COMPANY_VEHICLE and OWN_VEHICLE subtypes (no duplicate OWN_VEHICLE)`
      );
      assert.equal(m.subtypes[0].workflow, "STANDARD");
      assert.equal(m.subtypes[1].workflow, "KM_RATE");
    }

    const ownVehicleCases = [
      { modeCode: "TWO_WHEELER_PETROL", subCode: "OWN_VEHICLE", km: 20, expectedRate: 3.5, expectedAmt: 70 },
      { modeCode: "TWO_WHEELER_EV", subCode: "OWN_VEHICLE", km: 20, expectedRate: 1.0, expectedAmt: 20 },
      { modeCode: "FOUR_WHEELER_PETROL", subCode: "OWN_VEHICLE", km: 20, expectedRate: 5.0, expectedAmt: 100 },
      { modeCode: "FOUR_WHEELER_EV", subCode: "OWN_VEHICLE", km: 20, expectedRate: 1.75, expectedAmt: 35 },
    ];

    for (const c of ownVehicleCases) {
      const entry = {
        expenseType: "TRAVEL",
        travelModeCode: c.modeCode,
        travelSubtypeCode: c.subCode,
        distanceKm: c.km,
        numberPlatePhotos: [receipt("np.jpg")],
        startKmPhotos: [receipt("sk.jpg")],
        endKmPhotos: [receipt("ek.jpg")],
      };
      const errs = travelSvc.resolveTravelEntry(entry, { modes: modesWithIds, policy: stdPolicy });
      assert.deepEqual(errs, [], `${c.modeCode} -> ${c.subCode} should resolve with total KM without startKm/endKm`);
      assert.equal(entry.travel.workflow, "KM_RATE");
      assert.equal(entry.travel.ratePerKm, c.expectedRate);
      assert.equal(entry.distanceKm, c.km);
      assert.equal(entry.requestedAmount, c.expectedAmt);
    }

    // Company Vehicle under each of the 4 modes uses existing Company Vehicle STANDARD workflow
    for (const vCode of vehicleModeCodes) {
      const compEntry = {
        expenseType: "TRAVEL",
        travelModeCode: vCode,
        travelSubtypeCode: "COMPANY_VEHICLE",
        requestedAmount: 450,
      };
      const errs = travelSvc.resolveTravelEntry(compEntry, { modes: modesWithIds, policy: stdPolicy });
      assert.deepEqual(errs, [], `${vCode} -> COMPANY_VEHICLE should resolve as STANDARD workflow`);
      assert.equal(compEntry.travel.workflow, "STANDARD");
      assert.equal(compEntry.distanceKm, 0);
      assert.equal(compEntry.requestedAmount, 450);
    }

    // Company-decided custom Own-Vehicle ratePerKm on Travel Mode / Subtype overrides Local Conveyance rates
    const customCompanyModes = modesWithIds.map((m) => {
      if (m.code === "TWO_WHEELER_PETROL") {
        return {
          ...m,
          ratePerKm: 4.75,
          subtypes: m.subtypes.map((s) => (s.code === "OWN_VEHICLE" ? { ...s, ratePerKm: 4.75 } : s)),
        };
      }
      if (m.code === "FOUR_WHEELER_PETROL") {
        return {
          ...m,
          ratePerKm: 8.5,
        };
      }
      return m;
    });

    const serializedCustom = travelSvc.serializeModes(customCompanyModes, stdPolicy);
    const ser2W = serializedCustom.find((m) => m.code === "TWO_WHEELER_PETROL");
    const ser4W = serializedCustom.find((m) => m.code === "FOUR_WHEELER_PETROL");
    assert.equal(ser2W.ratePerKm, 4.75);
    assert.equal(ser2W.subtypes.find((s) => s.code === "OWN_VEHICLE").ratePerKm, 4.75);
    assert.equal(ser4W.ratePerKm, 8.5);
    assert.equal(ser4W.subtypes.find((s) => s.code === "OWN_VEHICLE").ratePerKm, 8.5);

    const customEntry = {
      expenseType: "TRAVEL",
      travelModeCode: "TWO_WHEELER_PETROL",
      travelSubtypeCode: "OWN_VEHICLE",
      distanceKm: 20,
      numberPlatePhotos: [receipt("np.jpg")],
      startKmPhotos: [receipt("sk.jpg")],
      endKmPhotos: [receipt("ek.jpg")],
    };
    const customErrs = travelSvc.resolveTravelEntry(customEntry, { modes: customCompanyModes, policy: stdPolicy });
    assert.deepEqual(customErrs, []);
    assert.equal(customEntry.travel.ratePerKm, 4.75);
    assert.equal(customEntry.requestedAmount, 95);
  });

  it("Scenario 39: Disallowed Travel entry combined with another entry of a different claim type keeps Travel excess as excess (never allowed)", async () => {
    const input = rules.normalizeInput({
      claimMode: "NORMAL",
      claimDate: "2026-10-29",
      customerName: "Acme Corp",
      destinationCity: "Pune",
      entries: [
        {
          expenseType: "TRAVEL",
          travelModeId: "mode_flight",
          travelModeCode: "FLIGHT",
          travelModeName: "Flight",
          travelSubtypeId: "sub_flight_eco",
          travelSubtypeCode: "FLIGHT_ECONOMY",
          travelSubtypeName: "Flight Economy",
          requestedAmount: 5000,
          remark: "Flight to Pune",
          receipts: [receipt("flight.jpg")],
        },
        {
          expenseType: "FOOD",
          requestedAmount: 300,
          remark: "Dinner",
          receipts: [receipt("food.jpg")],
        },
      ],
    });

    const amounts = await rules.calculateAmounts({
      input,
      typeConfig: types.TRAVEL,
      employees: [empL1],
      policy: mockPolicy,
      entitlements: baseEntitlements,
      destinationClass: "A",
      actor: EMP1,
      allTypes: Object.values(types),
      travelEntitlements: mockTravelEntitlementRows,
    });

    // Flight (5000) is NOT entitled for L1 -> allowed = 0, excess = 5000
    // Food (300) is within L1 Class A limit (400) -> allowed = 300, excess = 0
    assert.equal(amounts.grandRequested, 5300);
    assert.equal(amounts.grandAllowed, 300);
    assert.equal(amounts.grandExcess, 5000);
    assert.equal(input.entries[0].allowedAmount, 0);
    assert.equal(input.entries[0].excessAmount, 5000);
    assert.equal(input.entries[1].allowedAmount, 300);
    assert.equal(input.entries[1].excessAmount, 0);
  });

  it("Scenario 40: Multi-employee (2, 3, 4 persons) Travel claim with mixed level entitlements and KM_RATE Own Vehicle aggregates accurately", async () => {
    const EMP3 = "64b000000000000000000003";
    const EMP4 = "64b000000000000000000004";
    const empL5 = { _id: EMP2, name: "Rohan Sharma", levelRef: { levelNumber: 5, name: "L5" }, gradeRef: { code: "G5" } };
    const empL1b = { _id: EMP3, name: "Kiran Patil", levelRef: { levelNumber: 1, name: "L1" }, gradeRef: { code: "G1" } };
    const empL5b = { _id: EMP4, name: "Sneha Joshi", levelRef: { levelNumber: 5, name: "L5" }, gradeRef: { code: "G5" } };
    const mixedTravelEntitlements = [
      ...mockTravelEntitlementRows,
      { expenseTypeCode: "TRAVEL", status: "active", levelNumber: 5, cityClass: "ALL", travelModeId: "mode_flight", travelModeCode: "FLIGHT", allowedSubtypes: [{ subtypeId: "sub_flight_eco", subtypeCode: "FLIGHT_ECONOMY", maxAmount: null }] },
      { expenseTypeCode: "TRAVEL", status: "active", levelNumber: 5, cityClass: "ALL", travelModeId: "mode_4w", travelModeCode: "FOUR_WHEELER", allowedSubtypes: [{ subtypeId: "sub_4w_own", subtypeCode: "OWN_VEHICLE", maxAmount: null }] },
      { expenseTypeCode: "TRAVEL", status: "active", levelNumber: 1, cityClass: "ALL", travelModeId: "mode_4w", travelModeCode: "FOUR_WHEELER", allowedSubtypes: [{ subtypeId: "sub_4w_own", subtypeCode: "OWN_VEHICLE", maxAmount: null }] },
    ];

    const input = rules.normalizeInput({
      claimMode: "NORMAL",
      claimDate: "2026-10-29",
      customerName: "Acme Corp",
      destinationCity: "Pune",
      numberOfEmployees: 4,
      employeeIds: [EMP2, EMP1, EMP3, EMP4],
      entries: [
        {
          expenseType: "TRAVEL",
          travelModeId: "mode_flight",
          travelModeCode: "FLIGHT",
          travelModeName: "Flight",
          travelSubtypeId: "sub_flight_eco",
          travelSubtypeCode: "FLIGHT_ECONOMY",
          travelSubtypeName: "Flight Economy",
          requestedAmount: 8000,
          remark: "4-person flight",
          receipts: [receipt("flight4.jpg")],
        },
        {
          expenseType: "TRAVEL",
          travelModeId: "mode_4w",
          travelModeCode: "FOUR_WHEELER",
          travelModeName: "4-Wheeler",
          travelSubtypeId: "sub_4w_own",
          travelSubtypeCode: "FOUR_WHEELER_OWN_VEHICLE",
          travelSubtypeName: "Own Vehicle",
          travelWorkflow: "KM_RATE",
          distanceKm: 100,
          ratePerKm: 12,
          requestedAmount: 1200,
          remark: "4-person 4W own vehicle",
          numberPlatePhotos: [receipt("np.jpg")],
          startKmPhotos: [receipt("sk.jpg")],
          endKmPhotos: [receipt("ek.jpg")],
        },
      ],
    });
    travelSvc.resolveTravelEntry(input.entries[0], { modes: mockTravelModes, policy: mockPolicy });
    travelSvc.resolveTravelEntry(input.entries[1], { modes: mockTravelModes, policy: mockPolicy });

    const amounts = await rules.calculateAmounts({
      input,
      typeConfig: types.TRAVEL,
      employees: [empL5, empL1, empL1b, empL5b],
      policy: mockPolicy,
      entitlements: baseEntitlements,
      destinationClass: "A",
      actor: EMP2,
      allTypes: Object.values(types),
      travelEntitlements: mixedTravelEntitlements,
    });

    // Entry 0 (Flight 8000 across 4 employees = 2000 each): 2 L5 entitled (4000 allowed) + 2 L1 not entitled (4000 excess)
    assert.equal(input.entries[0].allowedAmount, 4000);
    assert.equal(input.entries[0].excessAmount, 4000);
    assert.equal(input.entries[0].entitlementStatus, "PARTIAL");
    assert.ok(input.entries[0].excessReason.includes("not covered by your current travel entitlement (Level 1)"));

    // Entry 1 (4W Own Vehicle 100 km * 12/km = 1200 across 4 employees = 300 each): all 4 entitled -> 1200 allowed
    assert.equal(input.entries[1].allowedAmount, 1200);
    assert.equal(input.entries[1].excessAmount, 0);
    assert.ok(input.entries[1].plainExplanation.includes("100 km × ₹12/km = ₹1,200"));
    assert.equal(amounts.grandRequested, 9200);
    assert.equal(amounts.grandAllowed, 5200);
    assert.equal(amounts.grandExcess, 4000);
  });

  it("Scenario 41: claimToInput preserves direct distanceKm and travel metadata on saved KM_RATE Travel draft", () => {
    const draftClaim = {
      claimMode: "NORMAL",
      claimDate: new Date("2026-10-29"),
      customerName: "Acme Corp",
      trip: { destination: "Pune" },
      employeeCount: 1,
      employeeClaims: [{ employee: { employeeId: EMP1 }, items: [] }],
      entries: [
        {
          expenseType: "TRAVEL",
          travelModeId: "mode_2w",
          travelModeCode: "TWO_WHEELER",
          travelModeName: "2-Wheeler",
          travelSubtypeId: "sub_2w_own",
          travelSubtypeCode: "TWO_WHEELER_OWN_VEHICLE",
          travelSubtypeName: "Own Vehicle",
          travelWorkflow: "KM_RATE",
          distanceKm: 40,
          ratePerKm: 5,
          requestedAmount: 200,
          remark: "Site visit by bike",
          numberPlatePhotos: [receipt("np.jpg")],
          startKmPhotos: [receipt("sk.jpg")],
          endKmPhotos: [receipt("ek.jpg")],
        },
      ],
    };
    const rebuilt = rules.claimToInput(draftClaim);
    assert.equal(rebuilt.entries[0].distanceKm, 40);
    assert.equal(rebuilt.entries[0].travelModeCode, "TWO_WHEELER");
    assert.equal(rebuilt.entries[0].travelSubtypeCode, "TWO_WHEELER_OWN_VEHICLE");
    const errs = travelSvc.resolveTravelEntry(rebuilt.entries[0], { modes: mockTravelModes, policy: mockPolicy });
    assert.deepEqual(errs, []);
    assert.equal(rebuilt.entries[0].requestedAmount, 200);
  });

  it("Scenario 42: OTHER claim within configured limit (<= 50) goes directly to Accounts Admin (SUBMITTED); above limit (> 50) goes through Reporting Manager (APPROVAL_PENDING)", () => {
    const policyWithLimit50 = {
      ...mockPolicy,
      approvalLimitRules: [
        { roleName: "Senior Executive", levelNumber: 8, maxAmount: 50, status: "active" },
      ],
    };
    const cfgWithLimit50 = rules.resolvePolicyConfig(policyWithLimit50);
    const MGR_ID = "64b000000000000000000099";

    // 1. Within limit (₹40 <= ₹50): approvalKind is NONE, no approverId required, status = SUBMITTED (Direct to Accounts Admin)
    const withinInput = rules.normalizeInput({
      claimMode: "NORMAL",
      claimDate: "2026-10-29",
      customerName: "Acme Corp",
      destinationCity: "Pune",
      employeeIds: [EMP1],
      entries: [
        {
          expenseType: "OTHER",
          otherSubType: "NORMAL",
          requestedAmount: 40,
          remark: "Stationery items",
          receipts: [receipt("other40.jpg")],
        },
      ],
    });
    assert.equal(rules.approvalKindFor(withinInput, { policyConfig: cfgWithLimit50, user: empL1 }), "NONE");
    const withinErrs = rules.validateClaimInput(withinInput, {
      policyConfig: cfgWithLimit50,
      typeConfig: types.OTHER,
      today: TODAY,
      user: empL1,
    });
    assert.deepEqual(withinErrs, [], "Within-limit OTHER claim should not require approverId");

    const withinClaim = {
      claimMode: "NORMAL",
      claimType: "OTHER",
      entries: withinInput.entries,
      grandRequested: 40,
      grandAllowed: 40,
      fullPayment: { requested: false },
      policySnapshot: { approvalLimitRules: cfgWithLimit50.approvalLimitRules, directAccountLimit: 50 },
    };
    rules.routeSubmission(withinClaim, { user: empL1 });
    assert.equal(withinClaim.status, "SUBMITTED");
    assert.equal(withinClaim.approvalRequired, false);
    assert.equal(withinClaim.managerApproval.kind, "NONE");

    // 2. Above limit (₹60 > ₹50): approvalKind is OTHER_EXPENSE, routes through Reporting Manager (APPROVAL_PENDING)
    const aboveInput = rules.normalizeInput({
      claimMode: "NORMAL",
      claimDate: "2026-10-29",
      customerName: "Acme Corp",
      destinationCity: "Pune",
      employeeIds: [EMP1],
      approverId: MGR_ID,
      entries: [
        {
          expenseType: "OTHER",
          otherSubType: "NORMAL",
          requestedAmount: 60,
          remark: "Courier charges",
          receipts: [receipt("other60.jpg")],
        },
      ],
    });
    assert.equal(rules.approvalKindFor(aboveInput, { policyConfig: cfgWithLimit50, user: empL1 }), "OTHER_EXPENSE");
    const aboveClaim = {
      claimMode: "NORMAL",
      claimType: "OTHER",
      entries: aboveInput.entries,
      grandRequested: 60,
      grandAllowed: 60,
      fullPayment: { requested: false },
      managerApproval: { approver: MGR_ID, approverName: "Reporting Manager" },
      policySnapshot: { approvalLimitRules: cfgWithLimit50.approvalLimitRules, directAccountLimit: 50 },
    };
    rules.routeSubmission(aboveClaim, { user: empL1 });
    assert.equal(aboveClaim.status, "APPROVAL_PENDING");
    assert.equal(aboveClaim.approvalRequired, true);
    assert.equal(aboveClaim.managerApproval.kind, "OTHER_EXPENSE");
  });

  it("Scenario 43: Multi-entry FOOD + OTHER claim with tagged Team Lead detects Team Lead level and routes above limit to above-level reporting user", () => {
    const approverSvc = require("../services/approverService");
    const teamLeadUser = {
      _id: EMP2,
      name: "Vikas TeamLead",
      designation: "Team Lead",
      isTeamLead: true,
    };
    assert.equal(approverSvc.isTeamLeadUser(teamLeadUser), true);
    assert.equal(approverSvc.getUserEffectiveLevel(teamLeadUser), 7);
    assert.equal(
      approverSvc.resolveDirectAccountLimit(empL1, [
        { roleName: "Senior Executive", maxAmount: 50, status: "active" },
      ]),
      50
    );
  });

  it("Scenario 44: Tier 1 Senior Executive L8 (Up to ₹50) & Tier 2 AVP L4 (₹50–₹100 Till AVP) resolves ₹100 limit for Team Lead (L7) and ₹50 for Senior Executive / Trainee", () => {
    const approverSvc = require("../services/approverService");
    const tieredRules = [
      { roleName: "Senior Executive", levelNumber: 8, maxAmount: 50, status: "active" },
      { roleName: "AVP", levelNumber: 4, maxAmount: 100, status: "active" },
    ];
    const traineeUser = { _id: EMP1, name: "Adesh Trainee", designation: "ERP Software Trainee", levelNumber: 11 };
    const srExecUser = { _id: EMP1, name: "Rohan SrExec", designation: "Senior Executive", levelNumber: 8 };
    const teamLeadUser = { _id: EMP2, name: "Abhay Mudgal", designation: "Customer Support Team Lead", isTeamLead: true, levelNumber: 7 };
    const avpUser = { _id: EMP2, name: "Anand AVP", designation: "AVP", levelNumber: 4 };

    assert.equal(approverSvc.resolveDirectAccountLimit(traineeUser, tieredRules), 50);
    assert.equal(approverSvc.resolveDirectAccountLimit(srExecUser, tieredRules), 50);
    assert.equal(approverSvc.resolveDirectAccountLimit(teamLeadUser, tieredRules), 100);
    assert.equal(approverSvc.resolveDirectAccountLimit([traineeUser, teamLeadUser], tieredRules), 100);
    assert.equal(approverSvc.resolveDirectAccountLimit(avpUser, tieredRules), 100);

    // Team Lead filing an OTHER claim of ₹80 (<= ₹100 limit) routes directly to Accounts ('NONE')
    const tlClaim80 = rules.normalizeInput({
      claimMode: "NORMAL",
      claimDate: "2026-10-29",
      customerName: "Acme Corp",
      destinationCity: "Pune",
      employeeIds: [EMP2],
      entries: [{ expenseType: "OTHER", otherSubType: "NORMAL", requestedAmount: 80, remark: "Stationery", receipts: [receipt("b.jpg")] }],
    });
    const cfgTiered = { ...policyConfig, approvalLimitRules: tieredRules };
    assert.equal(rules.approvalKindFor(tlClaim80, { policyConfig: cfgTiered, user: teamLeadUser }), "NONE");

    // Team Lead filing an OTHER claim of ₹120 (> ₹100 limit) routes to Reporting Manager ('OTHER_EXPENSE')
    const tlClaim120 = rules.normalizeInput({
      claimMode: "NORMAL",
      claimDate: "2026-10-29",
      customerName: "Acme Corp",
      destinationCity: "Pune",
      employeeIds: [EMP2],
      entries: [{ expenseType: "OTHER", otherSubType: "NORMAL", requestedAmount: 120, remark: "Tools", receipts: [receipt("b2.jpg")] }],
    });
    assert.equal(rules.approvalKindFor(tlClaim120, { policyConfig: cfgTiered, user: teamLeadUser }), "OTHER_EXPENSE");
  });
});
