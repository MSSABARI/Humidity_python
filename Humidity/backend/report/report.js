const express = require('express');
const connectToDatabase = require("../Database/configuration"); 
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');
const { createCanvas } = require('canvas');
const PDFDocument = require('pdfkit');

const app = express();
app.use(bodyParser.json());

let db;
connectToDatabase()
  .then(database => {
    db = database;
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1); // Exit the process if MongoDB connection fails
  });

const IST_OFFSET = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
const IMAGE_DIR = path.join(__dirname, 'images');
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure directories exist
if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR);
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// Utility functions
function getISTDate(date) {
  return new Date(date.getTime() + IST_OFFSET);
}

// Query data function
async function queryData(unit_ID) {
  const collectionName = `board_collection_${unit_ID}`;
  const collection = db.collection(collectionName);
  const now = getISTDate(new Date());
  const startDt = new Date(now.setHours(8, 30, 0, 0));
  const endDt = new Date(startDt.getTime() + 24 * 60 * 60 * 1000 - 1);

  return await collection
    .find({ created_at: { $gte: startDt, $lt: endDt } })
    .sort({ created_at: 1 })
    .toArray();
}

// Generate graph image
function generateGraph(times, temperatures, humidities, unit_ID) {
  const canvas = createCanvas(1000, 500);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Plot graph for temperature
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < times.length; i++) {
    const x = (i / (times.length - 1)) * canvas.width;
    const y = canvas.height - (temperatures[i] / 100) * canvas.height;
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Plot graph for humidity
  ctx.strokeStyle = '#0000ff';
  ctx.beginPath();
  for (let i = 0; i < times.length; i++) {
    const x = (i / (times.length - 1)) * canvas.width;
    const y = canvas.height - (humidities[i] / 100) * canvas.height;
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  const graphImagePath = path.join(IMAGE_DIR, `graph_data_unit_${unit_ID}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(graphImagePath, buffer);

  return graphImagePath;
}

// Excel generation endpoint
app.get('/download/excel/:unit_ID', async (req, res) => {
  const { unit_ID } = req.params;
  try {
    const data = await queryData(unit_ID);

    const rows = data.map((entry) => ({
      Time: new Date(entry.created_at).toISOString(),
      Temperature: entry.t || 0,
      Humidity: entry.h || 0,
    }));

    const fields = ['Time', 'Temperature', 'Humidity'];
    const opts = { fields };
    const csv = parse(rows, opts);

    const filename = path.join(TEMP_DIR, `graph_data_unit_${unit_ID}.csv`);
    fs.writeFileSync(filename, csv);

    res.download(filename, `graph_data_unit_${unit_ID}.csv`);
  } catch (err) {
    res.status(500).json({ error: 'Error generating the Excel file', message: err.message });
  }
});

// PDF generation endpoint
app.get('/download/pdf/:unit_ID', async (req, res) => {
  const { unit_ID } = req.params;
  try {
    const data = await queryData(unit_ID);

    const times = data.map((entry) => new Date(entry.created_at).toISOString());
    const temperatures = data.map((entry) => entry.t || 0);
    const humidities = data.map((entry) => entry.h || 0);

    const graphImagePath = generateGraph(times, temperatures, humidities, unit_ID);

    const doc = new PDFDocument();
    const pdfPath = path.join(TEMP_DIR, `graph_data_unit_${unit_ID}.pdf`);

    doc.pipe(fs.createWriteStream(pdfPath));
    doc.fontSize(18).text(`Graph Data for Unit ${unit_ID}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text('Time (IST)', { continued: true }).text('Temperature (°C)', { continued: true }).text('Humidity (%)');
    data.forEach((entry) => {
      doc.text(new Date(entry.created_at).toISOString(), { continued: true });
      doc.text(entry.t || 0, { continued: true });
      doc.text(entry.h || 0);
    });

    doc.image(graphImagePath, { fit: [500, 300], align: 'center' });
    doc.end();

    res.download(pdfPath, `graph_data_unit_${unit_ID}.pdf`);
  } catch (err) {
    res.status(500).json({ error: 'Error generating the PDF file', message: err.message });
  }
});

// Monthly average calculation
async function getMonthlyAvg(unit_ID, month, year) {
  const collectionName = `board_collection_${unit_ID}`;
  const collection = db.collection(collectionName);

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const data = await collection
    .find({ created_at: { $gte: startDate, $lt: endDate } })
    .toArray();

  const totalTemp = data.reduce((sum, entry) => sum + (entry.t || 0), 0);
  const totalHumidity = data.reduce((sum, entry) => sum + (entry.h || 0), 0);

  const count = data.length;
  if (count === 0) throw new Error('No data found for the given month.');

  const avgTemp = totalTemp / count;
  const avgHumidity = totalHumidity / count;

  return { unit_ID, month, year, avgTemp, avgHumidity };
}

// Monthly average endpoint
app.get('/average/:unit_ID', async (req, res) => {
  const { unit_ID } = req.params;
  const { month, year } = req.query;

  try {
    const result = await getMonthlyAvg(unit_ID, parseInt(month), parseInt(year));
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});


const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
