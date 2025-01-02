const { MongoClient } = require('mongodb');

const url = 'mongodb://localhost:27017'; 
const dbName = 'Humidity_Node'; 
let dbInstance = null;

async function connectToDatabase() {
  if (!dbInstance) {
    try {
      const client = await MongoClient.connect(url); 
      console.log('Connected to MongoDB');
      dbInstance = client.db(dbName); 
    } catch (err) {
      console.error('Failed to connect to MongoDB:', err);
      throw err; 
    }
  }
  return dbInstance;
}

module.exports = connectToDatabase;
