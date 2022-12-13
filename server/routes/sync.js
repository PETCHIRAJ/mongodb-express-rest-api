const express = require('express');
const { v4: uuidv4 } = require('uuid');

// recordRoutes is an instance of the express router.
// We use it to define our routes.
// The router will be added as a middleware and will take control of requests starting with path /listings.
const recordRoutes = express.Router();

// This will help us connect to the database
const dbo = require('../db/conn');

const getSafeLastPulledAt = (lastPulledAt) => {
  if (lastPulledAt !== 'null') {
    return new Date(lastPulledAt);
  }
  return new Date(0);
};

// This section will help you get a list of all the records.
recordRoutes.route('/sync/pull').post(async function (req, res) {
  const dbConnect = dbo.getDb();

  try {
    const lastPulledAt = getSafeLastPulledAt(req.body.lastPulledAt);
    console.log(`lastPulledAt: ${lastPulledAt}`);
    const created = await dbConnect
      .collection('weight')
      .find({ createdAt: { $gte: lastPulledAt } })
      .toArray();

    const updated = await dbConnect
      .collection('weight')
      .find({ updated_at: { $gte: lastPulledAt } })
      .toArray();

    console.log('created', created);
    res.json({
      changes: {
        weights: {
          created,
          updated,
          deleted: [],
        },
      },
      timestamp: Date.now(),
    });
  } catch (err) {
    console.log(err);
    res.status(400).send('Error fetching listings!');
  }
});

recordRoutes.route('/sync/push').post(function (req, res) {
  const dbConnect = dbo.getDb();
  console.log('req.body', req.body.changes);
  const changes = req.body.changes;

  if (changes.weights.created.length > 0) {
    changes.weights.created.map((remoteEntry) => {
      dbConnect.collection('weight').insertOne(
        {
          id: uuidv4(),
          note: remoteEntry.note,
          weight: remoteEntry.weight,
          watermelonId: remoteEntry.id,
          createdAt: new Date(remoteEntry.created_at),
        },
        function (err, result) {
          if (err) {
            res.status(400).send('Error inserting matches!');
          } else {
            console.log(`Added a new match with id ${result.insertedId}`);
          }
        }
      );
    });
  }

  if (changes.weights.updated.length > 0) {
    changes.weights.updated.map((remoteEntry) => {
      dbConnect.collection('weight').updateOne(
        { watermelonId: remoteEntry.id },
        {
          $set: {
            note: remoteEntry.note,
            weight: remoteEntry.weight,
          },
        }
      );
    });
  }

  if (changes.weights.deleted.length > 0) {
    dbConnect.collection('weight').deleteMany(
      {
        _id: { $in: changes.weights.deleted },
      },
      function (err, _result) {
        if (err) {
          res
            .status(400)
            .send(`Error deleting with id ${changes.weights.deleted}!`);
        } else {
          console.log('1 document deleted');
        }
      }
    );
  }
  res.status(200).send('Success');
});

module.exports = recordRoutes;
