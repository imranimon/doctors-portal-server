const express = require('express')
const app = express()
const cors = require('cors')
const admin = require("firebase-admin");
const port = process.env.PORT || 5000
require('dotenv').config()
const { MongoClient, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const fileUpload = require('express-fileupload')


// middleware
app.use(cors())
app.use(express.json())
app.use(fileUpload())

//doctors-portal-admin.json
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


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
        const doctorCollection = database.collection("doctors");

        // GET
        app.get('/appointments', verifyToken, async (req, res) => {
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

        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const appointment = await appointmentCollection.findOne(query);
            res.json(appointment);
        })
        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            console.log(appointment)
            const result = await appointmentCollection.insertOne(appointment);
            res.json(result);
        });

        app.put('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    payment: payment
                }
            }
            const result = await appointmentCollection.updateOne(filter, updateDoc);
            res.json(result)
        })


        app.get('/doctors', async (req, res) => {
            const cursor = doctorCollection.find({})
            const doctors = await cursor.toArray();
            res.json(doctors)
        })

        app.post('/doctors', async (req, res) => {
            const name = req.body.name;
            const email = req.body.email;
            const img = req.files.image;
            const imgData = img.data;
            const encodedImage = imgData.toString('base64');
            const imageBuffer = Buffer.from(encodedImage, 'base64');
            const doctor = {
                name,
                email,
                image: imageBuffer
            }
            const result = await doctorCollection.insertOne(doctor);
            res.json(result)
        })


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

        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'eur',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

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