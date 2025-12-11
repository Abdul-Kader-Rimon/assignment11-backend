const express = require("express");
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
app.use(cors());
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.gfwnnwz.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const database = client.db('assignment11')
    const userCollections = database.collection('user')

    app.post('/users', async(req, res) => {
      const userInfo = req.body;
      userInfo.role = "buyer";
      userInfo.createdAt = new Date();

      const result = await userCollections.insertOne(userInfo);

      res.send(result)
    })

    app.get('/users/role/:email', async(req, res) => {
      const {email} = req.params

      const quary = { email: email }
      const result = await userCollections.findOne(quary)
      console.log(result)
      res.send(result)
    })



    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("server in running fine")
})

app.listen(port,()=> {
    console.log(`server is running on ${port}`);
    
})

