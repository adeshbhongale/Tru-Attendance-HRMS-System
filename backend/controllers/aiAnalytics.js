const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Leave = require('../models/Leave');
const model = require('../config/gemini');
const statsService = require('../services/employeeStatsService');

// @desc    Get AI-Powered Business Analytics (Employee scores based on summary stats)
// @route   GET /api/ai/analytics
// @access  Private/Admin
exports.getAIAnalytics = async (req, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch active employees
    const employees = await User.find({ role: 'employee' }).populate('shift');
    
    // Fetch all records for the last 30 days
    const attendanceRecords = await Attendance.find({
      date: { $gte: thirtyDaysAgo, $lte: now }
    });
    
    const leaveRecords = await Leave.find({
      createdAt: { $gte: thirtyDaysAgo, $lte: now }
    });

    const employeeStats = {};

    const attendanceRecordsMapped = attendanceRecords.map(a => {
      const record = a.toObject();
      const empUser = employees.find(e => e._id.toString() === record.user?.toString());
      return {
        ...record,
        workingHours: statsService.calculateWorkingHours(record),
        status: statsService.resolveStatus(record, empUser)
      };
    });

    employees.forEach(emp => {
      const empAttend = attendanceRecordsMapped.filter(r => r.user && r.user.toString() === emp._id.toString());
      const empLeaves = leaveRecords.filter(r => r.user && r.user.toString() === emp._id.toString());

      const workingDays = empAttend.filter(r => r.status !== 'Absent').length;
      const totalHours = empAttend.reduce((sum, r) => sum + (r.workingHours || 0), 0);
      const totalBreakMins = empAttend.reduce((sum, r) => {
        if (r.breaks && r.breaks.length > 0) {
          return sum + r.breaks.reduce((bSum, b) => bSum + (b.duration || 0), 0);
        }
        return sum;
      }, 0);
      
      const totalDist = empAttend.reduce((sum, r) => sum + (r.totalDistance || r.distance || 0), 0);
      const lateDays = empAttend.filter(r => r.status === 'Late' || r.isLate).length;
      const halfDayCount = empAttend.filter(r => r.status === 'Half Day' || r.isHalfDay).length;
      const absentDays = empAttend.filter(r => r.status === 'Absent').length;
      const leaveDays = empLeaves.filter(r => r.status === 'Approved').length;

      // Format work and break times
      const workHours = Math.floor(totalHours);
      const workMins = Math.round((totalHours % 1) * 60);
      const breakHours = Math.floor(totalBreakMins / 60);
      const breakMins = totalBreakMins % 60;

      employeeStats[emp._id] = {
        workingDays: `${workingDays} days`,
        totalWorkingHours: `${workHours}hr ${workMins}m`,
        totalBreakTime: `${breakHours}hr ${breakMins}m`,
        totalDistance: `${totalDist.toFixed(2)} km`,
        currentShift: emp.shift?.name || "Day Shift",
        currentWorkingHours: "0m",
        currentBreak: "0m",
        currentDistance: "0.00 km",
        lateDays,
        halfDayCount,
        absentDays: `${absentDays} days`,
        leaveDays: `${leaveDays} days`
      };
    });

    // Format employee list details for the Gemini prompt
    const employeeDataForPrompt = employees.map((emp, index) => {
      const stats = employeeStats[emp._id];
      return `${index + 1}. Name: ${emp.name}, Department: ${emp.department || 'General'}, Stats:
- Working Days: ${stats.workingDays}
- Total Working HR: ${stats.totalWorkingHours}
- Total Break Time: ${stats.totalBreakTime}
- Total Distance: ${stats.totalDistance}
- Current Shift: ${stats.currentShift}
- Current Working Hours: ${stats.currentWorkingHours}
- Current Break: ${stats.currentBreak}
- Current Distance: ${stats.currentDistance}
- Late Days: ${stats.lateDays}
- Half Day Count: ${stats.halfDayCount}
- Absent Days: ${stats.absentDays}
- Leave Days: ${stats.leaveDays}`;
    }).join('\n\n');

    const prompt = `
Analyze the performance of the following employees based on their summary statistics. For each employee:
1. Calculate a single overall performance score (out of 100) that must be above 50 (i.e. between 50 and 100).
2. Provide exactly 3 concise, actionable improvements/tips (maximum 10 words per tip).
3. Provide exactly 2 weak points or areas of concern (maximum 10 words per weak point).

Criteria to consider for the score:
- Attendance & Reliability (impacted by Absent Days, Leave Days)
- Punctuality & Shift Adherence (impacted by Late Days, Half Days)
- Productivity & Work Hours (impacted by Total Working Hours relative to Working Days)
- Break Discipline (impacted by Total Break Time)

Employees:
${employeeDataForPrompt}

Generate the response in EXACTLY this JSON format:
{
  "scores": [
    {
      "name": "string (exact employee name)",
      "score": number,
      "suggestions": ["short tip 1", "short tip 2", "short tip 3"],
      "weakPoints": ["short weak point 1", "short weak point 2"]
    }
  ]
}

Return ONLY the raw JSON object. Do not include markdown code blocks, do not include any other text.
`;

    // Local Fallback Score Calculator
    const calculateFallbackScores = () => {
      return employees.map(emp => {
        const stats = employeeStats[emp._id];
        const workingDaysNum = parseInt(stats.workingDays) || 0;
        const absentDaysNum = parseInt(stats.absentDays) || 0;
        const leaveDaysNum = parseInt(stats.leaveDays) || 0;
        const lateDaysNum = stats.lateDays || 0;
        const halfDaysNum = stats.halfDayCount || 0;

        let totalHours = 0;
        const hoursMatch = stats.totalWorkingHours.match(/(\d+)hr/);
        const minsMatch = stats.totalWorkingHours.match(/(\d+)m/);
        if (hoursMatch) totalHours += parseInt(hoursMatch[1]);
        if (minsMatch) totalHours += parseInt(minsMatch[1]) / 60;

        let totalBreakMins = 0;
        const bHoursMatch = stats.totalBreakTime.match(/(\d+)hr/);
        const bMinsMatch = stats.totalBreakTime.match(/(\d+)m/);
        if (bHoursMatch) totalBreakMins += parseInt(bHoursMatch[1]) * 60;
        if (bMinsMatch) totalBreakMins += parseInt(bMinsMatch[1]);

        const attendanceScore = Math.max(0, 100 - (absentDaysNum * 12) - (leaveDaysNum * 5));
        const punctualityScore = Math.max(0, 100 - (lateDaysNum * 10) - (halfDaysNum * 12));
        const avgHrs = workingDaysNum > 0 ? (totalHours / workingDaysNum) : 0;
        const productivityScore = Math.min(100, Math.round((avgHrs / 8) * 100));
        const avgBreak = workingDaysNum > 0 ? (totalBreakMins / workingDaysNum) : 0;
        const breakScore = Math.max(0, 100 - Math.max(0, avgBreak - 60) * 1.5);

        const overallScore = Math.max(51, Math.round(attendanceScore * 0.35 + punctualityScore * 0.25 + productivityScore * 0.30 + breakScore * 0.10));

        const suggestions = [];
        if (absentDaysNum > 0) suggestions.push("Focus on reducing absent days");
        if (lateDaysNum > 0) suggestions.push("Strive for more punctual clock-ins");
        if (halfDaysNum > 0) suggestions.push("Avoid partial shift half-days");
        if (suggestions.length < 3) suggestions.push("Maintain current work schedule");
        if (suggestions.length < 3) suggestions.push("Optimize daily break intervals");
        if (suggestions.length < 3) suggestions.push("Keep up the good productivity");
        const finalSuggestions = suggestions.slice(0, 3);

        const weakPoints = [];
        if (absentDaysNum > 0) weakPoints.push("High absenteeism rate");
        if (lateDaysNum > 0) weakPoints.push("Punctuality improvement needed");
        if (halfDaysNum > 0) weakPoints.push("Multiple partial shift half-days");
        if (weakPoints.length < 2) weakPoints.push("Keep consistency in shift clock-ins");
        if (weakPoints.length < 2) weakPoints.push("Optimize break time intervals");
        const finalWeakPoints = weakPoints.slice(0, 2);

        return {
          name: emp.name,
          score: overallScore,
          suggestions: finalSuggestions,
          weakPoints: finalWeakPoints
        };
      });
    };

    let scores = [];
    let isFallback = false;
    const apiKey = process.env.GEMINI_API_KEY;
    const isKeyMissing = !apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE';

    if (isKeyMissing) {
      console.warn('⚠️ Gemini API key is missing or using placeholder in .env file. Using local fallback scores.');
      scores = calculateFallbackScores();
      isFallback = true;
    } else {
      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          scores = parsed.scores || [];
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (apiErr) {
        console.warn('⚠️ Gemini API Call Failed or invalid response, using fallback scores:', apiErr.message);
        scores = calculateFallbackScores();
        isFallback = true;
      }
    }

    // Merge computed scores back into employee objects
    const data = employees.map(emp => {
      const matched = scores.find(s => s.name.toLowerCase() === emp.name.toLowerCase());
      const fallbackSuggs = [
        "Maintain current work schedule",
        "Optimize daily break intervals",
        "Keep up the good productivity"
      ];
      const fallbackWeakPoints = [
        "None identified",
        "Keep consistency in shift clock-ins"
      ];
      
      let finalScore = matched ? matched.score : 60;
      if (finalScore < 51) finalScore = 51; // force score above 50
      
      return {
        _id: emp._id,
        name: emp.name,
        department: emp.department || 'General',
        stats: employeeStats[emp._id],
        score: finalScore,
        suggestions: (matched && Array.isArray(matched.suggestions)) ? matched.suggestions : fallbackSuggs,
        weakPoints: (matched && Array.isArray(matched.weakPoints)) ? matched.weakPoints : fallbackWeakPoints
      };
    });

    res.status(200).json({
      success: true,
      data,
      isFallback
    });
  } catch (err) {
    console.error('CRITICAL ERROR in getAIAnalytics:', err.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI analytics.',
      error: err.message
    });
  }
};
