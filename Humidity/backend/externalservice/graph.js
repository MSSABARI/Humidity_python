const express = require('express');
const connectToDatabase = require('../Database/configuration');
const WebSocket = require('ws');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
const PORT = 3000;
const IST = 'Asia/Kolkata';

const wss = new WebSocket.Server({ noServer: true });
const clients = {};

const dataHistory = {};

let db; // Global variable to hold the database connection

// Initialize database connection
async function initializeDatabase() {
    try {
        const client = await connectToDatabase();  // Assuming `connectToDatabase` is a function that connects to MongoDB
        db = client.db('your_database_name'); // Replace with your database name
        console.log('Database connected');
    } catch (err) {
        console.error('Error connecting to the database:', err);
        process.exit(1); // Exit the app if DB connection fails
    }
}

app.use(express.json());  // Middleware to parse JSON body

app.post('/api/v1/update_graph_collection', async (req, res) => {
    const { unit_ID, t, h, w, eb, ups, x, y } = req.body;

    if (!db) {
        return res.status(500).json({ error: 'Database not connected' });
    }

    const collectionName = `Board_${unit_ID}`;
    const collection = db.collection(collectionName);
    const now = dayjs().tz(IST).toDate();

    const logEntry = {
        unit_ID,
        t,
        h,
        w,
        eb,
        ups,
        x,
        y,
        created_at: now,
        updated_at: now
    };

    try {
        const result = await collection.insertOne(logEntry);

        if (!dataHistory[unit_ID]) dataHistory[unit_ID] = [];
        dataHistory[unit_ID].push(logEntry);

        await broadcastGraphData(unit_ID);

        res.json({ status: 'success', inserted_id: result.insertedId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function broadcastGraphData(unit_ID) {
    if (!clients[unit_ID] || clients[unit_ID].length === 0) return;

    const collectionName = `Board_${unit_ID}`;
    const collection = db.collection(collectionName);
    const now = dayjs().tz(IST);

    const startOfWindow = now.startOf('day').hour(14).minute(0).second(0);
    const endOfWindow = startOfWindow.add(23, 'hours').add(59, 'minutes').add(59, 'seconds');

    const startUTC = startOfWindow.utc().toDate();
    const endUTC = endOfWindow.utc().toDate();

    try {
        const data = await collection.find({
            created_at: { $gte: startUTC, $lt: endUTC }
        }).sort({ created_at: 1 }).toArray();

        const response = [['Time', 'Humidity', 'Temperature']];
        data.forEach(entry => {
            const time = dayjs(entry.created_at).tz(IST).toISOString();
            const humidity = entry.h || 0;
            const temperature = entry.t || 0;
            response.push([time, humidity, temperature]);
        });

        const message = { data: response };
        clients[unit_ID].forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    } catch (err) {
        console.error(err);
    }
}

wss.on('connection', (ws, req) => {
    const unit_ID = parseInt(req.url.split('/').pop(), 10);

    if (!clients[unit_ID]) clients[unit_ID] = [];
    clients[unit_ID].push(ws);

    console.log(`WebSocket connection established for unit_ID: ${unit_ID}`);

    ws.on('message', async (message) => {
        console.log(`Received data: ${message}`);
        const parsedData = JSON.parse(message);
        dataHistory[unit_ID].push(parsedData);

        clients[unit_ID].forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(dataHistory[unit_ID]));
            }
        });
    });

    ws.on('close', () => {
        console.log(`WebSocket connection closed for unit_ID: ${unit_ID}`);
        clients[unit_ID] = clients[unit_ID].filter(client => client !== ws);
    });
});

app.get('/api/v1/graphdata/:unit_ID', async (req, res) => {
    const { unit_ID } = req.params;
    const { start_time, end_time } = req.query;

    if (!db) {
        return res.status(500).json({ error: 'Database not connected' });
    }

    const collectionName = `Board_${unit_ID}`;
    const collection = db.collection(collectionName);

    try {
        const startDT = new Date(start_time);
        const endDT = new Date(end_time);

        const data = await collection.find({
            created_at: { $gte: startDT, $lt: endDT }
        }).sort({ created_at: 1 }).toArray();

        const response = [['Time', 'Humidity', 'Temperature']];
        data.forEach(entry => {
            const time = dayjs(entry.created_at).tz(IST).toISOString();
            const humidity = entry.h || 0;
            const temperature = entry.t || 0;
            response.push([time, humidity, temperature]);
        });

        res.json({ data: response });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const server = app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await initializeDatabase();
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
