const express = require('express')
const app = express()
const cors = require('cors')
const admin = require("firebase-admin");
const port = process.env.PORT || 5000
require('dotenv').config()
const { MongoClient } = require('mongodb')

//doctors-portal-admin.json
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// middleware
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.ug28d.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req, res, next) {
    if (req?.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];
        try {
            const decodeedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodeedUser.email;
        } catch {

        }

    }
    next()
}

async function run() {
    try {
        await client.connect();
        const database = client.db("DoctorsPortal");
        const appointmentCollection = database.collection("appointments");
        const userCollection = database.collection("users");

        // GET
        app.get('/appointments',verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            let appointments = []
            if (email && date) {
                const query = { email: email, date: date };
                appointments = await appointmentCollection.find(query).toArray();
            } else {
                appointments = await appointmentCollection.find({}).toArray();
            }
            res.send(appointments);
        });

        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            const result = await appointmentCollection.insertOne(appointment);
            res.json(result);
        });

        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin })
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await userCollection.insertOne(user);
            console.log(result);
            res.json(result);
        });

        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email }
            const options = { upsert: true };
            const updateDoc = { $set: user }
            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.json(result);
        });

        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail
            if (requester) {
                const requesterAcccount = await userCollection.findOne({ email: requester })
                if (requesterAcccount.role === 'admin') {
                    const filter = { email: user.email }
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await userCollection.updateOne(filter, updateDoc);
                    res.json(result);
                } else {
                    res.status(401).json({ message: 'User does not have access to make admin' })
                }
            } else {
                res.status(403).json({ message: 'User does not have access to make admin' })
            }

        });

        app.get("/db", (req, res) => {
            res.send('Database Connected')
        })
    } finally {
        // await client.close();
    }

}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("Doctor's portal running")
})

app.listen(port, () => {
    console.log(`Doctor's portal listening at http://localhost:${port}`)
})