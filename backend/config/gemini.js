const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

// if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
//   console.warn('⚠️ WARNING: GEMINI_API_KEY is missing or using placeholder in .env file');
// }

const genAI = new GoogleGenerativeAI(apiKey || 'dummy_key');

const model = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
});

module.exports = model;
