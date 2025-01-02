const express = require('express');
const { queryBoardData } = require('../externalservice/board_data');
const router = express.Router();

router.get('/board/:unit_ID', async (req, res) => {
  const { unit_ID } = req.params;
  const db = req.app.locals.db; 

  try {
    const data = await queryBoardData(unit_ID, db);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
