const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let readings = [];

function getStatus(level) {
  if (level < 100) return 'Normal';
  if (level < 150) return 'Alert';
  return 'Danger';
}

app.post('/api/readings', (req, res) => {
  const { sensorId, waterLevelCm, timestamp } = req.body;

  if (!sensorId || typeof sensorId !== 'string' || sensorId.trim() === '') {
    return res.status(400).json({ error: 'Missing or invalid sensorId.' });
  }

  if (
    waterLevelCm === undefined ||
    typeof waterLevelCm !== 'number' ||
    isNaN(waterLevelCm) ||
    waterLevelCm < 0 ||
    waterLevelCm > 500
  ) {
    return res.status(400).json({
      error: 'waterLevelCm must be a number between 0 and 500.'
    });
  }

  const newReading = {
    sensorId,
    waterLevelCm: parseFloat(waterLevelCm.toFixed(1)),
    timestamp: timestamp || new Date().toISOString()
  };

  readings.unshift(newReading);
  return res.status(201).json(newReading);
});

app.get('/api/readings', (req, res) => {
  res.json(readings.slice(0, 50));
});

function calculateSummary() {
  if (readings.length === 0) {
    return {
      totalReadings: 0,
      average: 0,
      min: 0,
      max: 0,
      statusCounts: { Normal: 0, Alert: 0, Danger: 0 },
      trend: 'steady',
      latest: null
    };
  }

  const levels = readings.map((r) => r.waterLevelCm);
  const sum = levels.reduce((acc, curr) => acc + curr, 0);
  const average = parseFloat((sum / levels.length).toFixed(1));
  const min = Math.min(...levels);
  const max = Math.max(...levels);

  const statusCounts = { Normal: 0, Alert: 0, Danger: 0 };
  readings.forEach((r) => {
    const status = getStatus(r.waterLevelCm);
    statusCounts[status]++;
  });

  let trend = 'steady';
  if (readings.length >= 10) {
    const recent5 = readings.slice(0, 5);
    const previous5 = readings.slice(5, 10);

    const avgRecent = recent5.reduce((acc, r) => acc + r.waterLevelCm, 0) / 5;
    const avgPrev = previous5.reduce((acc, r) => acc + r.waterLevelCm, 0) / 5;

    const diff = avgRecent - avgPrev;
    if (diff > 1.5) trend = 'rising';
    else if (diff < -1.5) trend = 'falling';
  }

  return {
    totalReadings: readings.length,
    average,
    min,
    max,
    statusCounts,
    trend,
    latest: readings[0]
  };
}

app.get('/api/summary', (req, res) => {
  res.json(calculateSummary());
});

function getFallbackAdvisory(summary) {
  const latestLevel = summary.latest ? summary.latest.waterLevelCm : 0;
  const status = getStatus(latestLevel);
  const trend = summary.trend;

  if (status === 'Danger') {
    return `[FALLBACK ADVISORY]\nEN: DANGER! Creek water level is high at ${latestLevel} cm and ${trend}. Prepare for immediate evacuation.\nFIL: PANGANIB! MATAAS ANG TUBIG SA ILOG (${latestLevel} cm) AT ITO AY ${trend.toUpperCase()}. MAGHANDA SA AGARANG PAG-LIKAS.`;
  } else if (status === 'Alert') {
    return `[FALLBACK ADVISORY]\nEN: ALERT! Water level is elevated at ${latestLevel} cm (${trend}). Stay alert.\nFIL: BABALA! MATAAS ANG TUBIG SA LEVEL NA ${latestLevel} cm (${trend}). MAGING MASIDHI.`;
  } else {
    return `[FALLBACK ADVISORY]\nEN: NORMAL. Water level is safe at ${latestLevel} cm (${trend}). Continue monitoring weather updates.\nFIL: NORMAL. LIGTAS ANG LEVEL NG TUBIG SA ${latestLevel} cm (${trend}). PATULOY NA MAG-ABANG.`;
  }
}

app.post('/api/advisory', async (req, res) => {
  const summary = calculateSummary();

  if (!summary.latest) {
    return res.json({ advisory: 'No data available yet. Please run simulator.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.json({ advisory: getFallbackAdvisory(summary) });
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an automated flood advisory system for a local barangay in Manila. 
Analyze ONLY the provided numerical summary data below. Do not assume outside weather data.

Summary Data:
- Current Level: ${summary.latest.waterLevelCm} cm
- Status: ${getStatus(summary.latest.waterLevelCm)}
- Water Level Trend: ${summary.trend}
- Average Level: ${summary.average} cm
- Minimum Level: ${summary.min} cm
- Maximum Level: ${summary.max} cm

Task:
Write a clear, brief public advisory for residents.
Rules:
1. Maximum 3 sentences total.
2. Provide the text in BOTH English (EN) and Filipino (FIL).
3. Base action recommendations strictly on the current water status and trend.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return res.json({ advisory: response.text() });
  } catch (error) {
    return res.json({ advisory: getFallbackAdvisory(summary) });
  }
});

app.listen(PORT, () => {
  console.log(`BantayBaha server running on port ${PORT}`);
});
