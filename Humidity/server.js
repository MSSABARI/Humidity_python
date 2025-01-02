const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

// Import route modules
const boardRoutes = require('./backend/routes/boardRoutes');


const app = express();

// Middleware to parse incoming JSON data
app.use(express.json());

// MongoDB connection
const url = 'mongodb://localhost:27017';
const dbName = 'Humidity_Node';
let db;

// Connect to MongoDB
MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true })
  .then((client) => {
    db = client.db(dbName);
    console.log('Connected to MongoDB');
    app.locals.db = db;  // Store db connection in locals for easy access in routes
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);  // Exit the application if the connection fails
  });

app.use('/api/board', boardRoutes);



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
