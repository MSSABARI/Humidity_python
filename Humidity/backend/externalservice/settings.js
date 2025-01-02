const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();
app.use(express.json());

const uri = 'mongodb://localhost:27017'; 
const client = new MongoClient(uri);
let db, settings, Board_1, Board_2, Board_3;

async function connectDB() {
    await client.connect();
    db = client.db('Humidity_Node'); 
    settings = db.collection('settings');
    Board_1 = db.collection('Board_1');
    Board_2 = db.collection('Board_2');
    Board_3 = db.collection('Board_3');
}
connectDB().catch(console.error);

function getBoardCollection(unit_ID) {
    if (unit_ID === 1) return Board_1;
    if (unit_ID === 2) return Board_2;
    if (unit_ID === 3) return Board_3;
    throw new Error(`Invalid unit_ID: ${unit_ID}`);
}

app.get('/api/v1/settings', async (req, res) => {
    try {
        const servers = await settings.find().toArray();
        servers.forEach(srv => srv._id = srv._id.toString());
        res.json({ servers });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/v1/settings/add_server', async (req, res) => {
    try {
        const {
            unit_ID,
            humidity_high,
            humidity_low,
            temp_high,
            temp_low,
            water_level_high,
            water_level_low,
        } = req.query;

        let parsedUnitID = unit_ID ? parseInt(unit_ID, 10) : undefined;

        if (!parsedUnitID) {
            const existingServers = await settings.find().toArray();
            parsedUnitID = existingServers.length
                ? Math.max(...existingServers.map(srv => srv.unit_ID)) + 1
                : 1;
        } else {
            const existingServer = await settings.findOne({ unit_ID: parsedUnitID });
            if (existingServer) {
                return res.status(400).json({ detail: `Server with unit_ID ${parsedUnitID} already exists` });
            }
        }

        const serverData = {
            unit_ID: parsedUnitID,
            humidity_high: parseFloat(humidity_high),
            humidity_low: parseFloat(humidity_low),
            temp_high: parseFloat(temp_high),
            temp_low: parseFloat(temp_low),
            water_level_high: parseFloat(water_level_high),
            water_level_low: parseFloat(water_level_low),
        };

        await settings.insertOne(serverData);

        const boardEntry = {
            unit_ID: parsedUnitID,
            t: 0,
            h: 0,
            w: 0,
            eb: 0,
            ups: 0,
            x: 0,
            y: 0,
        };
        const collection = getBoardCollection(parsedUnitID);
        await collection.insertOne(boardEntry);


        res.json({ message: 'Server and corresponding Board entry added successfully', unit_ID: parsedUnitID });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/api/v1/settings/update_server', async (req, res) => {
    const unit_ID = parseInt(req.query.unit_ID, 10);

    try {
        if (!unit_ID) {
            return res.status(400).json({ error: 'unit_ID is required' });
        }

        const { unit_ID: _, ...updateData } = req.query;

        for (const key in updateData) {
            const value = parseFloat(updateData[key]);
            if (!isNaN(value)) {
                updateData[key] = value;
            }
        }

        const result = await settings.updateOne({ unit_ID }, { $set: updateData });

        if (result.matchedCount === 0) {
            return res.status(404).json({ detail: 'Server not found' });
        }

        res.json({ message: 'Server updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/v1/settings/delete_server', async (req, res) => {
    const unit_ID = parseInt(req.query.unit_ID, 10);

    try {
        if (!unit_ID) {
            return res.status(400).json({ error: 'unit_ID is required' });
        }

        const result = await settings.deleteOne({ unit_ID });

        if (result.deletedCount === 0) {
            return res.status(404).json({ detail: 'Server not found in settings' });
        }

        const collection = getBoardCollection(unit_ID);
        const boardResult = await collection.deleteOne({ unit_ID });

        if (boardResult.deletedCount === 0) {
            return res.status(404).json({ detail: 'Board entry not found for the given unit_ID' });
        }

        res.json({ message: 'Server and corresponding Board entry deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


const PORT = 3007;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
