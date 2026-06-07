require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const models = [
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-pro",
  "gemini-2.0-flash-lite-001"
];

async function testModel(modelName) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("Say hello!");
    console.log(`✅  ${modelName} works!`);
    return true;
  } catch (err) {
    console.log(`❌  ${modelName} failed: ${err.message}`);
    return false;
  }
}

async function main() {
  for (const model of models) {
    console.log(`Testing model: ${model}...`);
    const success = await testModel(model);
    if (success) {
      console.log(`🏆  Found a working model: ${model}`);
      return;
    }
  }
  console.log("No working models found.");
}

main().catch(console.error);
