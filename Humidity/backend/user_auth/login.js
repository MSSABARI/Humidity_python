const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connectToDatabase = require("../Database/configuration"); // Import the common database connection
const { ObjectId } = require('mongodb');
const app = express();

app.use(express.json());

const PORT = 3007;
const SECRET_KEY = 'acceedo';

let db, users;

// Initialize database connection
connectToDatabase().then((database) => {
    db = database;
    users = db.collection('users');
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1); // Exit if connection fails
});

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

const verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

app.get('/api/v1/login', async (req, res) => {
    const { username, password } = req.query;

    try {
        const existingUser = await users.findOne({ username });
        if (!existingUser) {
            return res.status(400).json({ detail: 'Invalid username or password' });
        }

        const isPasswordValid = await verifyPassword(password, existingUser.password);
        if (!isPasswordValid) {
            return res.status(400).json({ detail: 'Invalid password' });
        }

        const token = jwt.sign({ id: existingUser._id }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ status: 'success', access_token: token, token_type: 'bearer' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ detail: 'Internal Server Error' });
    }
});

app.get('/api/v1/users', async (req, res) => {
    try {
        const userList = await users.find().toArray();
        if (userList.length === 0) {
            return res.status(404).json({ detail: 'No users found' });
        }

        res.json({ users: userList.map(user => ({ ...user, _id: undefined })) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ detail: 'Internal Server Error' });
    }
});

app.post('/api/v1/users/create', async (req, res) => {
    const { user_ID, username, role, emailId, phoneNo, password } = req.query;

    // Validate required fields
    if (!password) {
        return res.status(400).json({ detail: 'Password is required' });
    }

    if (!user_ID || !username || !role || !emailId || !phoneNo) {
        return res.status(400).json({ detail: 'All fields are required' });
    }

    try {
        // Check if user_ID already exists
        const existingUser = await users.findOne({ user_ID });
        if (existingUser) {
            return res.status(400).json({ detail: 'User ID already exists' });
        }

        // Hash the password
        const hashedPassword = await hashPassword(password);

        // Create a new user
        const newUser = { user_ID, username, role, emailId, phoneNo, password: hashedPassword };

        await users.insertOne(newUser);
        res.json({ msg: 'User registered successfully' });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ detail: 'Internal Server Error' });
    }
});

app.put('/api/v1/users/update', async (req, res) => {
    const { user_ID, username, role, emailId, phoneNo, password } = req.query;

    // Validate required fields
    if (!user_ID) {
        return res.status(400).json({ detail: 'User ID is required' });
    }

    try {
        // Check if user exists
        const existingUser = await users.findOne({ user_ID });
        if (!existingUser) {
            return res.status(404).json({ detail: 'User not found' });
        }

        // Prepare the updated user data
        const updatedUser = {
            ...(username && { username }),
            ...(role && { role }),
            ...(emailId && { emailId }),
            ...(phoneNo && { phoneNo }),
        };

        // If a password is provided, hash it
        if (password) {
            const hashedPassword = await hashPassword(password);
            updatedUser.password = hashedPassword;
        }

        // Update the user in the database
        await users.updateOne({ user_ID }, { $set: updatedUser });
        res.json({ msg: 'User updated successfully' });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ detail: 'Internal Server Error' });
    }
});

app.delete('/api/v1/users/delete/:user_ID', async (req, res) => {
    const { user_ID } = req.params;

    try {
        const existingUser = await users.findOne({ user_ID });
        if (!existingUser) {
            return res.status(404).json({ detail: 'User not found' });
        }

        await users.deleteOne({ user_ID });
        res.json({ msg: 'User deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ detail: 'Internal Server Error' });
    }
});

app.post("/api/v1/logout", async (req, res) => {
  const { token } = req.body;

  if (!activeTokens.has(token)) {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }

  activeTokens.delete(token);
  res.json({ status: "success", message: "Logged out successfully" });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
