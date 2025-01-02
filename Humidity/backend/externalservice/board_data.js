const express = require("express");
const connectToDatabase = require("../Database/configuration");
const router = express.Router(); // Use router for routing
const logger = console;

let db;

// Initialize the database connection
(async () => {
    try {
        db = await connectToDatabase();
        logger.info("Database connected successfully");
    } catch (error) {
        logger.error("Error connecting to the database:", error);
        process.exit(1); 
    }
})();

router.get("/api/v1/dashboard/:unit_ID", async (req, res) => {
    const unit_ID = parseInt(req.params.unit_ID);

    if (isNaN(unit_ID) || unit_ID <= 0) {
        return res.status(400).json({ detail: "Invalid unit_ID" });
    }

    const collectionName = `Board_${unit_ID}`;
    const collection = db.collection(collectionName);

    try {
        const boardData = await collection.findOne({ unit_ID });

        if (!boardData) {
            return res.status(404).json({ detail: "Data not found" });
        }

        const {
            t = boardData.t,
            h = boardData.h,
            w = boardData.w,
            eb = boardData.eb,
            ups = boardData.ups,
            x = 1,
            y = 1
        } = req.query;

        const updateValues = {
            t: parseInt(t),
            h: parseInt(h),
            w: parseInt(w),
            eb: parseInt(eb),
            ups: parseInt(ups),
            x: parseInt(x),
            y: parseInt(y)
        };

        const result = await collection.updateOne(
            { unit_ID },
            { $set: updateValues }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ detail: "Failed to update data, unit_ID not found" });
        }

        logger.info(`Board data updated successfully for unit_ID ${unit_ID}:`, updateValues);

        await updateGraphCollection(unit_ID, updateValues);

        await sendToAllClients({ unit_ID, ...updateValues });

        res.status(200).json({
            unit_ID,
            status: "Data updated successfully",
            ...updateValues
        });
    } catch (error) {
        logger.error("Error updating dashboard data:", error);
        res.status(500).json({ detail: "An error occurred while updating the data" });
    }
});

async function updateGraphCollection(unit_ID, updateValues) {
    const graphCollection = db.collection("GraphCollection");
    await graphCollection.insertOne({
        unit_ID,
        t: updateValues.t,
        h: updateValues.h,
        w: updateValues.w,
        timestamp: new Date()
    });
    logger.info(`Graph data updated for unit_ID ${unit_ID}`);
}

// Function to send data to all connected clients
async function sendToAllClients(data) {
    logger.info("Sending data to all connected clients:", data);
}

// Route to create new server data
router.post("/api/v1/dashboard/create", async (req, res) => {
    const unit_ID = parseInt(req.query.unit_ID);

    logger.info(`Creating new server with unit_ID: ${unit_ID}`);

    if (isNaN(unit_ID) || unit_ID <= 0) {
        return res.status(400).json({ detail: `Invalid unit_ID ${unit_ID}` });
    }

    const collectionName = `Board_${unit_ID}`;
    const collection = db.collection(collectionName);

    try {
        const existingServer = await collection.findOne({ unit_ID: unit_ID });

        if (existingServer) {
            return res.status(400).json({ detail: `Server with unit_ID ${unit_ID} already exists` });
        }

        const newServer = {
            unit_ID: unit_ID,
            t: 0,
            h: 0,
            w: 0,
            eb: 0,
            ups: 0,
            x: 0,
            y: 0,
        };

        const result = await collection.insertOne(newServer);

        if (result.acknowledged) {
            logger.info(`Server created successfully in collection ${collectionName}: ${JSON.stringify(newServer)}`);
            return res.status(200).json({ unit_ID, status: 'Server created successfully', collection: collectionName });
        } else {
            return res.status(500).json({ detail: 'Failed to create server' });
        }
    } catch (error) {
        logger.error('Error creating server:', error);
        return res.status(500).json({ detail: 'An error occurred while creating the server' });
    }
});

module.exports = router;
